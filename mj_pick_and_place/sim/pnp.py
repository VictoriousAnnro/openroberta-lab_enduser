from collections import deque
from pathlib import Path
import glfw
import mujoco as mj
import mujoco
import mujoco.viewer
import numpy as np
import roboticstoolbox as rtb
from robot_descriptions import ur5e_mj_description, robotiq_2f85_mj_description
from spatialmath import SE3

_HERE = Path(__file__).parent.parent

def init() -> tuple[mj.MjModel, mj.MjData]:
    """
    Initialize the MuJoCo simulation environment.
    
    Creates a scene with:
    - UR5e robot arm mounted at z=0.5m
    - Robotiq 2F-85 gripper attached to the arm
    - Red or blue box object (target to pick)
    - Drop bucket (target location)
    - Table surface
    
    Returns:
        tuple: (MuJoCo model, MuJoCo data) : these are the compiled simulation model and its data
    """
    # Load empty scene as base
    spec = mj.MjSpec().from_file((_HERE / "scenes/empty.xml").as_posix())

    # Load robot arm and gripper descriptions
    arm = mj.MjSpec().from_file(ur5e_mj_description.MJCF_PATH)
    gripper = mj.MjSpec().from_file(robotiq_2f85_mj_description.MJCF_PATH)

    # Attach robot arm to world at height 0.5m with prefix "robot/"
    spec.worldbody.add_frame(pos=[0,0,0.5]).attach_body(arm.worldbody.first_body(), prefix="robot/")
    
    # Add red box (pickable object)
    # Position: [0.3m, 0.3m, 0.52m] :placed on the table
    box_body = spec.worldbody.add_body(name="red_box", pos=[0.3, 0.3, 0.52])
    box_body.add_geom(name="red_box", type=mj.mjtGeom.mjGEOM_BOX, 
                     size=[0.025, 0.025, 0.025], rgba=[1,0,0,1])
    box_body.add_freejoint()  # Makes object movable (6 DOF)

    # Add blue box (alternative target)
    box_body = spec.worldbody.add_body(name="blue_box", pos=[0.5, 0.3, 0.55])
    box_body.add_geom(name="blue_box", type=mj.mjtGeom.mjGEOM_BOX, 
                     size=[0.025, 0.025, 0.025], rgba=[0,0,1,1])
    box_body.add_freejoint()

    # Add drop bucket (target location for placing objects)
    box_body = spec.worldbody.add_body(name="drop_bucket", pos=[-0.5, 0.3, 0.51])
    box_body.add_geom(name="drop_bucket", type=mj.mjtGeom.mjGEOM_BOX, 
                     size=[0.1, 0.1, 0.005], rgba=[0.5,0.5,0.5,1])

    # Add table surface (static object)
    box_body = spec.worldbody.add_body(name="table_top", pos=[0.0, 0.0, 0.5])
    box_body.add_geom(name="table_top", type=mj.mjtGeom.mjGEOM_BOX, 
                     size=[0.8, 0.6, 0.01], rgba=[0.8, 0.8, 0.8, 1])

    # Find the attachment site on the robot arm and attach gripper
    s: mj.MjsSite = arm.worldbody.find_all(mj.mjtObj.mjOBJ_SITE)[0]
    s.attach_body(gripper.worldbody.first_body(), prefix="gripper/")

    # Compile the model and create data structure
    m = spec.compile()
    d = mj.MjData(m)
    return m, d

# Initialize the simulation
model, data = init()

# Robot configuration
# Home position: joints at specific angles (in radians) for "home" pose
home_qpos = [-1.5708, -1.5708, 1.5708, -1.5708, -1.5708, 0]

# Joint names (UR5e has 6 revolute joints)
joint_names = ['shoulder_pan_joint', 'shoulder_lift_joint', 'elbow_joint', 
               'wrist_1_joint', 'wrist_2_joint', 'wrist_3_joint']

# Actuator names (motors that control the joints)
actuator_names = ['shoulder_pan', 'shoulder_lift', 'elbow', 
                  'wrist_1', 'wrist_2', 'wrist_3']

# Add "robot/" prefix to all names (matches MuJoCo model structure)
joint_names = ["robot/" + jn for jn in joint_names]
actuator_names = ["robot/" + jn for jn in actuator_names]

# Load kinematic model for inverse kinematics calculations
# PS: Using UR5 model (close but not exact match to UR5e in simulation)
# This causes ~1-2cm positioning errors - fixed with offsets in this demo
robot = rtb.models.URDF.UR5()

# Calculate robot base offset (Z position of robot base in world frame)
body_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY, "robot/base_link")
mj.mj_forward(model, data)  # Update forward kinematics
robot_base_offset = data.xpos[body_id][2]  # Should be 0.5m

# Gripper offset: distance from wrist to gripper tip
gripper_offset = 0.116  # meters

def _cb(key: int):
    """Keyboard callback function for viewer (created for tests)"""
    if key is glfw.KEY_SPACE:
        print("hello")

def get_joints():
    """
    Get current joint positions from the simulation.
    
    Returns:
        np.ndarray: Array of 6 joint angles (in radians)
    """
    return np.array([data.joint(name).qpos[0] for name in joint_names])

def set_actuators(positions):
    """
    Command the robot actuators to move to target joint positions.
    
    Note: This only sets commands to target positions : the robot doesn't move.
    
    Args:
        positions: Array of 6 target joint angles (in radians)
    """
    for i, name in enumerate(actuator_names):
        act_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_ACTUATOR, name)
        data.ctrl[act_id] = positions[i]

def mujoco_to_rtb(mujoco_pos):
    """
    Convert position from MuJoCo world frame to Robotics Toolbox (RTB) frame.
    
    The two coordinate systems are different:
    - MuJoCo and RTB have opposite X and Y axes
    - Z axes are offset by the robot base height (the robot bas is positioned at (0,0,0) in RTB)
    
    Transformation:
        RTB_x = -MuJoCo_x
        RTB_y = -MuJoCo_y
        RTB_z = MuJoCo_z - robot_base_offset
    
    Args:
        mujoco_pos: Position in MuJoCo world frame [x, y, z]
    
    Returns:
        np.ndarray: Position in RTB frame [x, y, z]
    """
    rtb_pos = np.array([-mujoco_pos[0], -mujoco_pos[1], 
                        mujoco_pos[2] - robot_base_offset])
    return rtb_pos

def get_ee_mujoco():
    """
    Get current end-effector position in MuJoCo world frame.
    
    Returns:
        np.ndarray: End-effector position [x, y, z] in meters
    """
    ee_site_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_SITE, "robot/attachment_site")
    return data.site(ee_site_id).xpos.copy()

def solve_ik(target_pos, orientation=None):
    """
    Solve Inverse Kinematics (IK) to find joint angles for a target position.
    
    Given a desired end-effector position in MuJoCo world coordinates,
    this method calculates the joint angles needed to reach that position.
    
    Process:
    1) Convert target from MuJoCo frame to RTB frame
    2)  Apply compensation offset for UR5/UR5e mismatch
    3)  Add gripper length offset
    4) Set desired orientation (gripper pointing down)
    5)  Solve IK using RTB function
    
    Args:
        target_pos: Target position in MuJoCo world frame [x, y, z]
        orientation: Optional orientation (default: gripper pointing down)
    
    Returns:
        tuple: (success: bool, joint_angles: np.ndarray of 6 values)
    """
    # Convert to RTB frame and add correction offset (determined by trial and error)
    rtb_target = mujoco_to_rtb(target_pos) + np.array([-0.01, +0.02, 0])
    
    if orientation is None:
        # Create transformation matrix: position + gripper pointing down
        # SE3.Trans() creates translation, @ combines with rotation SE3.RPY()
        Tep = (SE3.Trans(rtb_target[0], rtb_target[1], rtb_target[2] + gripper_offset) @ 
               SE3.RPY([0, np.pi/2, 0]))
        
        # Solve IK using RTB function
        # q0 helps as it provides initial guess (current joint angles in Mujoco)
        sol = robot.ikine_LM(Tep, q0=get_joints())
    else:
        Tep = SE3.Trans(rtb_target[0], rtb_target[1], rtb_target[2]) @ SE3.RPY([orientation])
        sol = robot.ikine_LM(Tep, q0=get_joints())

    return sol.success, sol.q

def move_joints(target, duration=1.0):
    """
    Generate a smooth trajectory from current position to target joint configuration.
    
    Uses a function from RTB (jtraj) to create a smooth trajectory
    that respects velocity and acceleration limits.
    
    Args:
        target: Target joint configuration (6 angles in radians)
        duration: Time to execute trajectory (seconds)
    
    Returns:
        Trajectory object with .q attribute containing waypoints """
    
    start = get_joints()  # Get current joint positions 
    steps = int(duration / model.opt.timestep)  # Convert time to simulation steps

    # Generate smooth trajectory using robotics toolbox
    # jtraj = Joint space trajectory with quintic polynomial
    traj = rtb.jtraj(start, target, steps)
    return traj

def get_body_pos(name):
    """
    Get the position of a body (object) in the MuJoCo world frame.
    
    Args:
        name: Name of the body (for example : "red_box", "drop_bucket")
    
    Returns:
        np.ndarray: Position [x, y, z] in meters
    """
    mj.mj_forward(model, data)  # Update forward kinematics
    body_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY, name)
    body_pos = data.body(body_id).xpos.copy()
    return body_pos

def set_gripper(position):
    """
    Set gripper actuator position.
    
    Args:
        position: Gripper command (0 = open, 255 = closed)
    """
    gripper_act_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_ACTUATOR, "gripper/fingers_actuator")
    
    if gripper_act_id != -1:
        data.ctrl[gripper_act_id] = position

def open_gripper():
    """Opens the gripper"""
    set_gripper(0)

def close_gripper():
    """Closes the gripper"""
    set_gripper(255)

def execute_trajectory(traj_deque, viewer):
    """
    Execute a pre-computed trajectory by commanding each waypoint sequentially.
    
    The loop in this function:
    1) Pops each waypoint from the trajectory queue
    2) Commands the robot actuators to that configuration
    3) Steps the physics simulation forward one timestep
    4) Updates the visualization
    
    The robot physically moves as the simulation advances. This function
    doesn' instantly teleport the robot through the trajectory.
    
    Args:
        traj_deque: deque of joint configurations (each is 6 angles)
        viewer: MuJoCo viewer object (to check if window is still open)
    """
    while len(traj_deque) > 0 and viewer.is_running():
        q = traj_deque.popleft()  # Get next waypoint
        set_actuators(q)  # Command motors to move to this configuration
        mj.mj_step(model, data)  # Advance physics simulation by one timestep
        viewer.sync()  # Update visualization

def plan_trajectory_from_config(start_q, target_pos, duration):
    """
    Plan a trajectory starting from a specific joint configuration.
    
    This is necessary because the helper methods move_joints() and solve_ik() use get_joints() which read
    the current simulation state of the robot. 
    Because we will plan ahead multiple trajectories before executing them, we need to temporarily compute and put the robot in the expected
    starting configuration.
    
    Process:
    1) Set joint positions to start_q
    2) Update forward kinematics (mj_forward) -> this will temporarily put the robot in the starting configuration 
    3) Solve IK for target_pos
    4) Generate trajectory from start_q to IK solution
    5) Return goal configuration and trajectory
    
    Args:
        start_q: Starting joint configuration (6 angles)
        target_pos: Target end-effector position in MuJoCo frame [x, y, z]
        duration: Trajectory duration (seconds)
    
    Returns: The goal configuration and the trajectory to reach it
        tuple: (goal_config: np.ndarray, trajectory: deque)
               Returns (None, None) if IK fails
    """
    # Temporarily set simulation state of the robot to starting configuration
    for i, jn in enumerate(joint_names):
        data.joint(jn).qpos = start_q[i]
    mj.mj_forward(model, data)  # Update all dependent quantities
    
    # Plan trajectory from this configuration
    success, q_goal = solve_ik(target_pos)
    if success:
        traj = move_joints(q_goal, duration)
        return q_goal, deque(traj.q)  # Convert to deque for efficient popping
    return None, None

def main():
    """
    Main pick-and-place function.
    
    Sequence:
    1) Initialize robot to home position
    2)  Plan all 4 trajectories:
       - traj1: Home -> Above object
       - traj2: Above object -> At object (to grasp)
       - traj3: At object -> Above object (move up)
       - traj4: Above object -> Drop location
    3)  Execute trajectories sequentially with gripper actions between them
    
    All trajectories are planned before execution to avoid the robot to stop. 
    If computed in the loop, after a trajectory finishes, the robot stops because calculating them requires time creating a delay. 

    """
    # ------------------------- INITIALIZATION -------------------------
    # Set robot to home position
    for i, jn in enumerate(joint_names):
        data.joint(jn).qpos = home_qpos[i]  # Set joint positions
    for i, an in enumerate(actuator_names):
        data.actuator(an).ctrl = home_qpos[i]  # Set actuator commands
    
    open_gripper()  # Start with gripper open
    
    # Get object positions from simulation
    obj_pos = get_body_pos("blue_box")  # Object to pick <---- Feel free to change
    drop_pos = get_body_pos("drop_bucket")  # Where to place object
    
    # ------------------------- TRAJECTORY PLANNING -------------------------
    #Plan all trajectories before execution
    #Each trajectory starts where the previous one ends
    
    # Trajectory 1: Move from home to above object
    height_above_obj = 0.05
    q1, traj1 = plan_trajectory_from_config(home_qpos, obj_pos + [0, 0, height_above_obj], 2.0)#this traj needs at least 2.0 sec for execution

    # Trajectory 2: Move down to grasp object
    q2, traj2 = plan_trajectory_from_config(q1, obj_pos, 1.0)

    # Trajectory 3: Lift object up
    q3, traj3 = plan_trajectory_from_config(q2, obj_pos + [0, 0, height_above_obj], 1.0)

    # Trajectory 4: Move to drop location
    height_above_drop = 0.1
    q4, traj4 = plan_trajectory_from_config(q3, drop_pos + [0, 0, height_above_drop], 2.0)

    
    # ------------------------- RESET TO HOME -------------------------
    # After planning, reset simulation to home position
    # Indeed :planning temporarily modified simulation state
    for i, jn in enumerate(joint_names):
        data.joint(jn).qpos = home_qpos[i]
        data.actuator(actuator_names[i]).ctrl = home_qpos[i]
    
    # ------------------------- EXECUTION -------------------------
    # Launch viewer and execute pick-and-place 
    with mujoco.viewer.launch_passive(model, data) as viewer:
        
        # Phase 1: Move above object
        print("Phase 1: Moving above object...")
        execute_trajectory(traj1, viewer)
        
        # Phase 2: Move down to object
        print("Phase 2: Descending to grasp...")
        execute_trajectory(traj2, viewer)
        
        # Phase 3: Close gripper
        print("Phase 3: Grasping object...")
        close_gripper()
        # Wait for gripper to physically close (simulation needs time)
        # for _ in range(200):  # approc 1sec at 200Hz
        #     if not viewer.is_running():
        #         return
        #     mj.mj_step(model, data)
        #     viewer.sync()
        
        # Phase 4: Lift object
        print("Phase 4: Lifting object...")
        execute_trajectory(traj3, viewer)
        
        # Phase 5: Move to drop location
        print("Phase 5: Moving to drop location...")
        execute_trajectory(traj4, viewer)
        
        # Phase 6: Release object
        print("Phase 6: Releasing object...")
        open_gripper()
        # for _ in range(100):  
        #     if not viewer.is_running():
        #         return
        #     mj.mj_step(model, data)
        #     viewer.sync()
        
        print("Pick-and-place complete")
        
        # Keep viewer window open until user closes it
        while viewer.is_running():
            mj.mj_step(model, data)
            viewer.sync()

if __name__ == "__main__":
    main()