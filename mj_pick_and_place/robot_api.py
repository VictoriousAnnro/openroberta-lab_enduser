"""
--------------------------------------
Robot API: 

Purpose:
This file defines a simple API for controlling the UR5e robot arm in the simulation. 
You can use this API to connect tyour EUP tool to the robot without needing to understand MuJoCo, inverse
kinematics or trajectory planning.

Architecture:
This API sits between student EUP tools and the MuJoCo simulation:

            [Your EUP Tool] ---------------> [RobotAPI] (this file)  --------------->[sim/pnp.py] --------------->[MuJoCo Simulation] (physics engine)
                                                
            (calls methods like            (uses functions from pnp.py)          (low-level MUjoco control)
    move_to_position(), grasp(), etc.)                                           

    
----------------------------------------
Very important :
You need to implement a Simulation loop:

MuJoCo simulations require a CONTINUOUS LOOP that advances physics at regular
timesteps. Without this loop, nothing moves! The loop looks like:

    while running:
        # 1) Set actuator commands (what the motors should do)
        robot_api.step_simulation()

        # 2) This function internally calls:
        #    -> mujoco.mj_step(model, data) to advance physics
        #    -> Executes one waypoint from current trajectory
        #    -> Updates visualization

The step_simulation() method MUST be called continuously  for the robot to move.

------------------
Trajectory creation:

When you call methods like move_to_position() or pick_object(), they don't directly move the robot. 
Instead, they:

1) Plan a trajectory
2) Store trajectory as a queue of joint configurations (waypoints)
3) Return immediately some values

The movement only happens when step_simulation() is called repeatedly:
1)  Each call executes one waypoint from the trajectory queue
2) Sets robot actuators to that configuration
3) Advances physics by one timestep

Example:
robot.move_to_position(0.3, 0.3, 0.6)  #This only plans trajectory and returns immediately

while len(robot.current_trajectory) > 0:  #  THe movement happens here
    robot.step_simulation()  # Executes one waypoint
    time.sleep(0.005)  #Wait one timestep (5ms)


----------------------------------------
AVailable methods (SEe below):
1) launch_viewer() ->Open a 3D visualization window from MUjoco
2) initialize() -> Reset the robot to home position ------> VERY IMPORTANT
3) move_to_position(x, y, z, duration) -> Move end-effector to XYZ coordinates
4) move_to_object(name, height_offset) -> Move above an object
5) pick_object(name) -> Complete pick sequence (move down, grasp, move up the object)
6) grasp() ->Closes the gripper
7) release() ->Opens gripper
8) wait(seconds) ->Pause execution
9) step_simulation() ->Advance physics by one timestep [MUST BE CALLED IN A LOOP]

------------------
Coordinate system:

All positions are in meters:
Origin (0, 0, 0) is at the floor

Robot base is at (0, 0, 0.5) -> mounted 0.5 m above the floor
Objects on table are around z=0.52m

Example positions:
Red box: (0.3, 0.3, 0.52)
Drop bucket: (-0.5, 0.3, 0.51)

---------------------------
Objects in the scene:

"red_box" -> Small red cube
"blue_box" -> Small blue cube
"drop_bucket" -> Gray rectangular platform
"table_top" -> Table surface (fixed, cannot be moved)

--------------------------------------
"""

import sys
from pathlib import Path
import numpy as np
from collections import deque
import mujoco as mj
import mujoco.viewer
import threading

# Add parent directory to Python path to import sim module
sys.path.append(str(Path(__file__).parent.parent))

from sim import pnp  # Import low-level MuJoCo control functions


class RobotAPI:
    """
    THe main Robot control API class

    It converts complex MuJoCo operations into simple methods that you can call from your programming interface.

    IT has:
        model (mj.MjModel): MuJoCo model (physics description)
        data (mj.MjData): MuJoCo data (current simulation state)
        current_trajectory (deque): Queue of waypoints being executed
        viewer (MujocoViewer): 3D visualization window
        data_lock (Lock): Thread synchronization for safe data access ( ONL)
    """

    def __init__(self):
        """
        Initialize the robot API.

        This connects to the already-initialized MuJoCo simulation from pnp.py.
        The simulation model and data are shared globally.
        """
        # MuJoCo model and data 
        self.model = pnp.model # Physics model (not modifiable after compilation)
        self.data = pnp.data # Simulation state (positions, velocities, forces...)

        # Trajectory in queue
        self.current_trajectory = None  # deque filled with several joint configurations

        # Viewer for 3D visualization
        self.viewer = None # MuJoCo viewer
        self.viewer_thread = None # Thread running viewer loop
        self.viewer_running = False # Flag to control viewer thread

        # Thread safety to protect the mjData object from simultaneous access
        self.data_lock = threading.Lock()

        # Lightweight state tracking for experiment logic
        self.held_object = None
        self.pending_pick_object_name = None
        self.bag_fill_level = 0
        self.bag_full_threshold = 2  # number of drops before considered "full"
            # Minimum safe Z-offset (meters) above target positions to avoid collisions
            # Increase this value if you want the arm to travel higher above objects.
        self.safe_height_offset = 0.20  # 20 cm safe hover by default
        self.baggable_objects = {
            "nitrogen_tool",
            "chloroform_syringe",
            "toluene_syringe",
        }
        # Mapping from UI slot names to scene body names inside the Tedlar bag
        self.bag_slot_map = {
            "nitrogen_slot": "bag_slot_nitrogen",
            "chloroform_slot": "bag_slot_chloroform",
            "toluene_slot": "bag_slot_toluene",
        }
        self.mix_station_center = np.array([0.18, 0.38, 0.51])
        self.analysis_pad_center = np.array([0.35, -0.22, 0.51])
        self.mixture_ready = False
        self.analysis_ready = False
        self.analysis_press_latched = False
        # If a move_to_object call targeted a specific bag slot, we store it here
        self.pending_place_slot = None

    def _set_laptop_solution_display(self, show_solution: bool):
        """Best-effort helper to toggle the MuJoCo laptop screen."""
        try:
            if show_solution:
                pnp.show_solution_on_laptop()
            else:
                pnp.clear_laptop_solution_display()
        except Exception:
            pass

    def _detect_analysis_press_locked(self) -> bool:
        """Check if the wrist is pressing the analysis pad while lock is held."""
        try:
            pad_pose = self._get_body_position(
                "analysis_pad", self.analysis_pad_center
            )
            self.analysis_pad_center = pad_pose
            ee_pos = pnp.get_ee_mujoco()
        except Exception:
            return False

        lateral = np.linalg.norm((ee_pos - pad_pose)[:2])
        vertical = pad_pose[2] - ee_pos[2]
        pressing = lateral <= 0.035 and 0 <= vertical <= 0.03

        if pressing and not self.analysis_press_latched:
            self.analysis_press_latched = True
            return True
        if not pressing:
            self.analysis_press_latched = False
        return False

    def _get_body_position(self, body_name, fallback):
        """Fetch the live pose for a body, falling back if unavailable."""
        try:
            return pnp.get_body_pos(body_name).copy()
        except Exception:
            return fallback.copy()

    def get_station_pose(self, station_name):
        """Return the current pose for a named station on the workbench."""
        if station_name == "mix_station":
            self.mix_station_center = self._get_body_position(
                "mix_station", self.mix_station_center
            )
            return self.mix_station_center.copy()
        if station_name == "analysis_pad":
            self.analysis_pad_center = self._get_body_position(
                "analysis_pad", self.analysis_pad_center
            )
            return self.analysis_pad_center.copy()
        return None

    def _is_over_bag_zone(self, horizontal_tolerance=0.15, z_min=0.5, z_max=0.9):
        """Rudimentary check whether the wrist is hovering over the Tedlar bag opening."""
        try:
            bag_pos = pnp.get_body_pos("tedlar_bag_zone")
            ee_pos = pnp.get_ee_mujoco()
        except Exception:
            return False

        horizontal_dist = np.linalg.norm((ee_pos - bag_pos)[:2])
        within_height = z_min <= ee_pos[2] <= z_max
        return horizontal_dist <= horizontal_tolerance and within_height

    def launch_viewer(self):
        """
        Launch the MuJoCo 3D viewer in a separate window.

        The viewer runs in its own thread to prevent blocking. 
        It displays the  environment in real-time as the simulation runs.
        Important :  The viewer only DISPLAYS the simulation, it doesn't advance physics.!!
        You must call step_simulation() in a loop to move the robot.

        Returns:
        dictionnary: Status message {"status": "success"|"already_running", "message": "..."}

        Example of use:
            robot = RobotAPI()
            robot.launch_viewer()  ----> to launch the window
            #THen, you can see the robot, but it won't move until you call : step_simulation()
        """
        #To prevent opening multiple viewers
        if self.viewer_running:
            return {"status": "already_running", "message": "Viewer already open"}

        def viewer_loop():
            """
            ANother internal function that runs in separate thread.
            THis loops keeps the viewer window always open, which is important """

            self.viewer_running = True

            #Launch the passive viewer from Mujoco 
            with mujoco.viewer.launch_passive(self.model, self.data) as viewer:
                self.viewer = viewer

                #Keep viewer open until user closes 
                while viewer.is_running() and self.viewer_running:
                    #Synchronize viewer display with simulation data
                    #Note:Here I use lock to prevent data corruption if simulation
                    #is running in another thread
                    with self.data_lock:
                        viewer.sync()  #Update the display with latest data (Mjdata)

                    # Small delay needed
                    import time
                    time.sleep(0.01)  # 10ms delay

                #Cleanup when the viewer is closed
                self.viewer = None
                self.viewer_running = False

        #We start viewer in a background thread
        self.viewer_thread = threading.Thread(target=viewer_loop, daemon=True)
        self.viewer_thread.start()

        #Give viewer the time to open window 
        import time
        time.sleep(0.5)

        return {"status": "success", "message": "Mujoco viewer is launched"}

    def close_viewer(self):
        """
        THis function closes the viewer window.
        Returns:
        dictionnary: Status message
        """
        self.viewer_running = False
        if self.viewer:
            self.viewer.close()
        return {"status": "success", "message": "Viewer closed"}

    def initialize(self):
        """
        THis function reset the robot to its home position, and open the gripper.

        WHEN TO USE ?
        ->At the beginning of your program, always or force the end user of your product to use it at the beginning
        ->After completing a task, to reset for next task/session
        -> When robot gets into an awkward configuration

        Returns:
        dictionnary: Status message

        Comcrete example:
            robot.initialize()  # Robot moves to home position
        """
        #We set the joints to home configuration
        with self.data_lock:
            for i, jn in enumerate(pnp.joint_names):
                self.data.joint(jn).qpos = pnp.home_qpos[i]
                self.data.actuator(pnp.actuator_names[i]).ctrl = pnp.home_qpos[i]
            pnp.open_gripper()
            self.mixture_ready = False
            self.analysis_ready = False

        self._set_laptop_solution_display(False)

        return {"status": "success", "message": "Robot initialized"}

    def move_to_position(self, x, y, z, duration=2.0):
        """
        THis function moves the robot tool to a specific x,y,z position.

        MOre details:
        1)It calculates inverse kinematics to find corresponding joint angles
        2)COmputes a trajectiory from the current position to a target
        3)Stores the trajectory in self.current_trajectory variable
        4)Returns a dictionnary, message 

        Again : The robot won't move until you call step_simulation() in a loop!

        Args:
        x(float),y(float), z(float): coordinates in meters
        duration(float): time to execute movement in seconds ( default is 2.0)

        Returns:
        dictionnary:{"status": "success"|"error", "message": "..."}
        Returns error if position is unreachable

        Example of use :
        #WE plan a movement to a position above the table
        result = robot.move_to_position(0.3, 0.2, 0.6, duration=2.0)

        if result["status"] == "success":
            # Now execute the movement
            while len(robot.current_trajectory) > 0:
                robot.step_simulation()
                time.sleep(robot.model.opt.timestep)  # Usually 0.005s
        """
        try:
            # WE convert the inputs to floats and create a numpy array
            target_pos = np.array([float(x), float(y), float(z)])

            #THe data acess is locked data for safety
            with self.data_lock:
                #Get the current joint configuration
                current_q = pnp.get_joints()

                #Planning trajectory from current position to a target
                #This function is from pnp:
                # 1) It solves IK to find target joint angles for a given position in cartesian space
                # 2)It generates a trajectory (many waypoints)
                # 3)Returns  a goal configuration and  atrajectory
                target_q, traj = pnp.plan_trajectory_from_config(
                    current_q, target_pos, duration
                )

            #We check if a solution was found
            if target_q is None:
                return {
                    "status": "error",
                    "message": f"Cannot reach position ({x}, {y}, {z}). "
                               f"Position may be outside robot workspace."
                }

            #WE store the trajectory for execution
            #step_simulation() will later execute each waypoint from this queue
            self.current_trajectory = traj

            return {"status": "success", "message": f"Moving to ({x}, {y}, {z})"}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def move_to_object(self, object_name, height_offset=0.12):
        """
        Move the robot end-effector above an object with an offset.
        This is useful for picking an object.The robot will move to a position directly 
        above the object.

        Arguments:
        object_name(str): Name of the object  ("red_box", "blue_box", "drop_bucket")
        height_offset(float): How high above object to position (meters) default is : 0.05m (5cm above)

        Returns:
        dictionnary:Status message

        For example:
        # Move 5cm above the red box
        robot.move_to_object("red_box", height_offset=0.05)

        # Execute movement
        while len(robot.current_trajectory) > 0:
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)
        """
        try:
            with self.data_lock:
                # Resolve bag-slot aliases (UI names -> scene body names)
                body_name = self.bag_slot_map.get(object_name, object_name)

                # Current position of the object from simulation
                obj_pos = pnp.get_body_pos(body_name)  # Returns [x, y, z]

                # Choose height offset: explicit param takes precedence, otherwise use safe default
                if height_offset is None:
                    h = self.safe_height_offset
                else:
                    h = float(height_offset)

                # Target position: above the object (apply safe height)
                target_pos = obj_pos + np.array([0, 0, h])

                #Current joint configuration of the robot
                current_q = pnp.get_joints()

                #We plan a  trajectory to target
                target_q, traj = pnp.plan_trajectory_from_config(
                    current_q, target_pos, 2.0  # 2 second movement
                )

            #Check if the trajectory planning succeeded
            if target_q is None:
                return {
                    "status": "error",
                    "message": f"Cannot reach {object_name}. Object may be out of reach."
                }

            #Store the trajectory for execution
            self.current_trajectory = traj
            # If the user selected a bag slot alias, remember it so release()
            # can place the object into the exact slot instead of using the
            # generic bag drop distribution.
            if object_name in self.bag_slot_map:
                self.pending_place_slot = self.bag_slot_map[object_name]
            else:
                self.pending_place_slot = None

            return {"status": "success", "message": f"Moving to {object_name}"}

        except Exception as e:
            #Handle errors (e.g., object_name doesn't exist)
            return {"status": "error", "message": str(e)}

    def move_by_z(self, dz):
        """
        Move the end-effector vertically by dz meters (relative move in Z).
        Positive dz moves up, negative moves down. The planner will be
        invoked to move the arm to the new cartesian position.
        """
        try:
            with self.data_lock:
                ee = pnp.get_ee_mujoco()
                target = np.array([ee[0], ee[1], ee[2] + float(dz)])
                # Enforce minimum safe height
                if target[2] < self.safe_height_offset:
                    target[2] = self.safe_height_offset

                # Plan movement to target
                current_q = pnp.get_joints()
                target_q, traj = pnp.plan_trajectory_from_config(
                    current_q, target, 1.5
                )

                if target_q is None:
                    return {"status": "error", "message": "Cannot reach target height"}

                self.current_trajectory = traj
                return {"status": "success", "message": f"Moving by dz={dz}m"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    def pick_object(self, object_name):
        """
        Execute a complete pick sequence for an object.
        Important : 
        THe robot must already be positioned above the object by the end user !
        Meaninf the move_to_object() should be used first to place the robot above the pick location.

        ENtire workflow: move down -> grasp -> move up 
        1)Verify if the robot is above the object(with 20cm tolerance)
        2)MOve down the robot to the object
        3)Gripper is being closed 
        4)We move the robot back up
        5)Combine all above into a single trajectory

        Args:
        object_name(str): Name of object ("red_box", "blue_box")

        Returns:
        dictionnary:Status message. Returns en error if the robot is not above object

        Example -> Correct usage in your EUP tool:
        # Step 1:Position above object
        robot.move_to_object("red_box") # This will but the compyted trajectory into self.current_trajectory
        while len(robot.current_trajectory) > 0:
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)

        # Step 2: Pick the object
        robot.pick_object("red_box")
        while len(robot.current_trajectory) > 0:
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)

        Example -> INCORRECT usage:
            robot.pick_object("red_box")  # ERROR! Not positioned above object
        """
        try:
            with self.data_lock:
                #Get  the positionof the object 
                obj_pos = pnp.get_body_pos(object_name)
                height_above = 0.12  # default hover after pick (matches move_to_object)
                grasp_offset = 0.02  # stop slightly above the object to avoid collision

                #End-effector position
                current_ee_pos = pnp.get_ee_mujoco()

                #Expected position if the robot is above thr object
                expected_pos_above = obj_pos + np.array([0, 0, height_above])

                #Check if the robot is positioned correctly
                distance = np.linalg.norm(current_ee_pos - expected_pos_above)
                tolerance = 0.20  # 20cm tolerance 

                if distance > tolerance:
                    return {
                        "status": "error",
                        "message": f"Robot not above {object_name}! "
                                   f"Use move_to_object('{object_name}') first. "
                                   f"(Current distance: {distance:.3f}m, tolerance: {tolerance}m)"
                    }

                #FROm here, the robot is in a correct position, we plan pick the sequence
                current_q = pnp.get_joints()
                #Phase 1: move down only to a small grasp offset (avoid hitting the object)
                q1, traj1 = pnp.plan_trajectory_from_config(
                    current_q, obj_pos + np.array([0.0, 0.0, grasp_offset]), 1.0
                )

                if q1 is None:
                    return {
                        "status": "error",
                        "message": f"Cannot plan descent to {object_name}"
                    }

                # Phase 2: move up the object
                # Start from q1 (the previous position of the robot)
                # Use the API's safe_height_offset for the post-grasp lift
                lift_height = max(height_above, self.safe_height_offset)
                q2, traj2 = pnp.plan_trajectory_from_config(
                    q1, obj_pos + np.array([0, 0, lift_height]), 1.0
                )

                # Combine the trajectories with the gripper command
            # This creates the sequence: move down -> grasp -> hold -> move up
            combined = deque()
            combined.extend(traj1)  # move down trajectory
            # Close gripper at the end of the descent
            combined.append({'action': 'close_gripper'})

            # Insert a short hold (repeat the last waypoint) to allow the gripper to close and physics to settle
            try:
                # traj1 is a deque of joint arrays; take the last configuration
                last_q = traj1[-1]
                hold_time = 0.2  # seconds
                hold_steps = max(1, int(hold_time / pnp.model.opt.timestep))
                for _ in range(hold_steps):
                    combined.append(last_q)
            except Exception:
                pass

            combined.extend(traj2)  # move up trajectory

            #Store  the combined trajectory
            self.current_trajectory = combined
            self.pending_pick_object_name = object_name

            return {"status": "success", "message": f"Picking {object_name}"}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def grasp(self):
        """
        THis function close the gripper to grasp an object. This command executes immediately and is not queued like the trajectory.
        Returns:
        dictionary:Status message

        Example:
        robot.grasp()  

        # IF needed :
        # Wait for the gripper to physically close 
        for _ in range(200): 
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)
        """
        with self.data_lock:
            pnp.close_gripper()#Sets gripper actuator to the closed position
        return {"status": "success", "message": "Gripper closed"}

    def release(self):
        """
        THis open the gripper and is being executed immediately.
        Returns:
        dictionnary: Status message

        Example:
        robot.release()  

        #Wait for gripper if needed 
        for _ in range(100): 
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)"""


        with self.data_lock:
            dropped_object = self.held_object
            over_bag = self._is_over_bag_zone()
            pnp.open_gripper()  # Sets gripper actuator to open position

            # If we released a baggable object over the bag, place it into the
            # explicitly targeted bag slot if one was selected; otherwise fall
            # back to the previous grid-distribution behaviour. This prevents
            # the robot from re-using the same last-drop position when a slot
            # was chosen from the UI.
            if over_bag and dropped_object in self.baggable_objects:
                try:
                    if self.pending_place_slot:
                        # Place at the chosen slot body's position
                        slot_pos = pnp.get_body_pos(self.pending_place_slot)
                        # small upward offset so object is not inside table
                        drop_pos = slot_pos + np.array([0.0, 0.0, 0.015])
                        pnp.set_body_pos(dropped_object, drop_pos)
                        # clear pending slot after placement
                        self.pending_place_slot = None
                    else:
                        bag_pos = pnp.get_body_pos("tedlar_bag_zone")
                        # Cycle through a small grid of offsets to avoid perfect stacking
                        offsets = np.array([
                            [0.0, 0.0],
                            [0.02, 0.0],
                            [-0.02, 0.0],
                            [0.0, 0.02],
                            [0.0, -0.02],
                            [0.02, 0.02],
                            [-0.02, -0.02],
                        ])
                        idx = self.bag_fill_level if isinstance(self.bag_fill_level, int) else 0
                        choice = offsets[idx % len(offsets)]
                        height_layers = idx // len(offsets)
                        drop_z = 0.02 + 0.01 * height_layers
                        drop_pos = bag_pos + np.array([choice[0], choice[1], drop_z])
                        pnp.set_body_pos(dropped_object, drop_pos)
                except Exception:
                    pass

                self.bag_fill_level = min(
                    self.bag_fill_level + 1, self.bag_full_threshold
                )
                self.mixture_ready = False
                self.analysis_ready = False

            # After releasing, move the gripper to a safe hover to avoid immediate collisions
            try:
                # compute a safe hover above current gripper position
                ee = pnp.get_ee_mujoco()
                safe_hover = ee + np.array([0.0, 0.0, self.safe_height_offset])
                # plan a short trajectory away (1.0s)
                cur_q = pnp.get_joints()
                q_goal, traj = pnp.plan_trajectory_from_config(cur_q, safe_hover, 0.8)
                if q_goal is not None and traj is not None:
                    # if no current trajectory, set this as next; otherwise append
                    if not self.current_trajectory:
                        self.current_trajectory = traj
                    else:
                        self.current_trajectory.extend(traj)
            except Exception:
                pass

            self.held_object = None
            self.pending_pick_object_name = None

            return {
                "status": "success",
                "message": "Gripper opened",
                "bag_fill_level": self.bag_fill_level,
                "bag_is_full": self.bag_fill_level >= self.bag_full_threshold,
            }

    def wait(self, seconds):
        """
        THis pauses the execution for a specified time. This is a blocking wait, 
        your program will stop here for the duration but the simulation continues to run in the background.
        Args:
        seconds(float), the time to wait in seconds

        Returns:
        dictionnary:Status message

        Example:
        robot.grasp()
        robot.wait(1.0)# for 1 second we wait for the gripper to close
        robot.move_to_position(0, 0, 0.8) """
        import time
        time.sleep(float(seconds))
        return {"status": "success", "message": f"Waited {seconds}s"}

    def bag_is_full(self):
        """Return the current fill state of the Tedlar bag."""
        with self.data_lock:
            is_full = self.bag_fill_level >= self.bag_full_threshold
            return {
                "status": "success",
                "bag_is_full": is_full,
                "bag_fill_level": self.bag_fill_level,
                "bag_capacity": self.bag_full_threshold,
            }

    def solution_state(self):
        """Return flags representing the chemistry workflow readiness."""
        with self.data_lock:
            return {
                "status": "success",
                "mixture_ready": self.mixture_ready,
                "analysis_ready": self.analysis_ready,
                "solution_ready": self.analysis_ready,
            }

    def mark_solution_mixed(self):
        with self.data_lock:
            self.mixture_ready = True
            self.analysis_ready = False
            self.analysis_press_latched = False
        self._set_laptop_solution_display(False)

    def mark_analysis_complete(self):
        with self.data_lock:
            self.analysis_ready = True
            self.mixture_ready = False
            self.analysis_press_latched = False
        # Primary flow: use existing pnp helper to show the solution
        self._set_laptop_solution_display(True)

        # Simple, minimal: set the screen geom directly to green and forward+sync
        try:
            model = pnp.model
            data = pnp.data
            # Prefer the cached id from pnp if available
            gid = getattr(pnp, 'laptop_screen_geom_id', None)
            if gid is None or gid < 0:
                try:
                    gid = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, 'lab_laptop_screen')
                except Exception:
                    gid = -1

            if gid is not None and gid >= 0:
                green = np.array([0.08, 0.85, 0.12, 1.0])
                try:
                    model.geom_rgba[gid] = green
                except Exception:
                    pass
                try:
                    model.geom_emission[gid] = 1.5
                except Exception:
                    pass

                try:
                    mj.mj_forward(model, data)
                except Exception:
                    pass

                # Trigger viewer sync if present so the change is visible immediately
                try:
                    if self.viewer is not None:
                        try:
                            self.viewer.sync()
                        except Exception:
                            pass
                except Exception:
                    pass
            else:
                print("[debug] mark_analysis_complete: lab_laptop_screen geom id not found", flush=True)
        except Exception as e:
            print(f"[debug] mark_analysis_complete exception: {e}", flush=True)

    def is_mixture_ready(self):
        with self.data_lock:
            return self.mixture_ready

    def is_analysis_ready(self):
        with self.data_lock:
            return self.analysis_ready
    def get_object_position(self, object_name):
        """
        To get the current position of an object in the simulation.
        Useful for cecking if an object has moved.
        Args:
        object_name(str), the name of the object ("red_box", "blue_box", "drop_bucket")

        Returns:
        dictionnary:{"status": "success", "position": {"x": float, "y": float, "z": float}}
                  or {"status": "error", "message": "..."}

        Example:
        result = robot.get_object_position("red_box")
        if result["status"] == "success":
            pos = result["position"]
            print(f"Red box is at ({pos['x']}, {pos['y']}, {pos['z']})")
        """
        try:
            pos = pnp.get_body_pos(object_name)
            return {
                "status": "success",
                "position": {"x": float(pos[0]), "y": float(pos[1]), "z": float(pos[2])}
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def step_simulation(self):
        """
        This dvance the simulation by one timestep. IT IS THE MOST IMPORTANT METHOD !
        It has to be called repeatedly in a loop for anything to happen.
        Becayse, each call :
        1)First checks if there is a current trajectory
        2)If yes, it executes one waypoint, ONLY ONE (sets actuators to joint positions)
        3)IT advances physics by one timestep (mj_step)
        4)The gripper commands are also detected and executed

        USually, timestep: 0.005 seconds because that represents 200 Hz

        How to use it in your solutions:

        # Method 1 : Simple loop (single-threaded):
        robot.launch_viewer()
        robot.initialize()
        robot.move_to_position(0.3, 0.3, 0.6)

        while robot.viewer.is_running():#Until the user closes the window
            robot.step_simulation()#We execute one timestep
            time.sleep(robot.model.opt.timestep)#Maintain it real-time

        Returns:
        dictionnary:Status message
        """
        triggered_analysis_press = False
        with self.data_lock:
            #WE execute a trajectory if one exists
            if self.current_trajectory and len(self.current_trajectory) > 0:
                #We get the next waypoint from trajectory queue
                waypoint = self.current_trajectory.popleft()

                #WE check if this is a special gripper command
                if isinstance(waypoint, dict):
                    # Execute gripper action
                    if waypoint.get('action') == 'close_gripper':
                        pnp.close_gripper()
                        if self.pending_pick_object_name:
                            self.held_object = self.pending_pick_object_name
                            self.pending_pick_object_name = None
                    elif waypoint.get('action') == 'open_gripper':
                        pnp.open_gripper()
                        self.held_object = None
                        self.pending_pick_object_name = None
                else:
                    #IT was a normal trajectory waypoint
                    pnp.set_actuators(waypoint)

            #Advance physics by one timestep
            mujoco.mj_step(self.model, self.data)

            # If the analysis hasn't been shown yet, detect a pad press.
            # Previously this only allowed a press to trigger when a mixture
            # was ready. Allow the pad press to trigger the analysis flow
            # whenever the analysis result isn't already active so the laptop
            # will glow as soon as the robot clicks the pad.
            if not self.analysis_ready:
                if self._detect_analysis_press_locked():
                    triggered_analysis_press = True

        if triggered_analysis_press:
            self.mark_analysis_complete()

        return {"status": "success"}


# ------------------------------------
# Global instance:
# Create a single global instance thatyou can important in your code. This ensures all code uses the same robot/simulation instance

robot = RobotAPI()


