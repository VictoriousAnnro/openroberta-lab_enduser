from collections import deque
from pathlib import Path
from typing import Optional
import glfw
import mujoco as mj
import mujoco
import mujoco.viewer
import numpy as np
import roboticstoolbox as rtb
from robot_descriptions import ur5e_mj_description, robotiq_2f85_mj_description
from spatialmath import SE3

_HERE = Path(__file__).parent.parent

LAPTOP_SCREEN_IDLE_RGBA = np.array([0.05, 0.08, 0.12, 1.0])
LAPTOP_SCREEN_ACTIVE_RGBA = np.array([0.15, 0.85, 0.95, 1.0])
laptop_screen_geom_id: Optional[int] = None
laptop_screen_mat_id: Optional[int] = None

# Geom ids for checkmark strokes (and visible fallbacks)
check_short_gid: Optional[int] = None
check_long_gid: Optional[int] = None
check_short_vis_gid: Optional[int] = None
check_long_vis_gid: Optional[int] = None

WHITE_RGBA = np.array([0.0, 1.0, 0.0, 1.0])  # changed to green RGBA


def set_laptop_screen(display_solution: bool) -> bool:
    """Toggle laptop monitor color to indicate whether a solution is shown."""
    global laptop_screen_geom_id, laptop_screen_mat_id
    if laptop_screen_geom_id is None or laptop_screen_geom_id < 0:
        try:
            laptop_screen_geom_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, "lab_laptop_screen")
        except Exception:
            laptop_screen_geom_id = -1
    if laptop_screen_geom_id is None or laptop_screen_geom_id < 0:
        return False

    target = WHITE_RGBA if display_solution else LAPTOP_SCREEN_IDLE_RGBA
    
    # Try material id first
    if laptop_screen_mat_id is None or laptop_screen_mat_id < 0:
        try:
            laptop_screen_mat_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_MATERIAL, "screen_glow")
        except Exception:
            laptop_screen_mat_id = -1

    # If displaying a solution, try to attach the runtime-generated
    # texture asset (screen_success.png / screen_fail.png) to the
    # material so the laptop shows the image rather than a flat color.
    if display_solution:
        try:
            # Texture names are defined in the scene XML (created by init/ensure)
            tex_name = 'screen_success_tex'
            texid = mj.mj_name2id(model, mj.mjtObj.mjOBJ_TEXTURE, tex_name)
        except Exception:
            texid = -1
        if texid is not None and texid >= 0 and laptop_screen_mat_id is not None and laptop_screen_mat_id >= 0:
            try:
                # Assign texture id to material (bindings differ across mujoco versions)
                try:
                    model.mat_texid[laptop_screen_mat_id] = int(texid)
                except Exception:
                    try:
                        model.material_texid[laptop_screen_mat_id] = int(texid)
                    except Exception:
                        pass
                # Ensure the geom uses this material
                try:
                    model.geom_matid[laptop_screen_geom_id] = int(laptop_screen_mat_id)
                except Exception:
                    pass
            except Exception:
                pass

    if laptop_screen_mat_id is not None and laptop_screen_mat_id >= 0:
        try:
            model.mat_rgba[laptop_screen_mat_id] = target
        except Exception:
            try:
                model.material_rgba[laptop_screen_mat_id] = target
            except Exception:
                pass

    # Fallback to geom rgba
    try:
        model.geom_rgba[laptop_screen_geom_id] = target
        model.geom_rgba[laptop_screen_geom_id][0] = target[0]
    except Exception:
        pass

    # Toggle check-geometry visibility to match the screen state
    try:
        _set_check_visibility(bool(display_solution))
    except Exception:
        pass

    # Debug: print resolved ids and target color
    try:
        print(f"set_laptop_screen called: geom_id={laptop_screen_geom_id} mat_id={laptop_screen_mat_id} target={target}", flush=True)
    except Exception:
        pass

        

        


def _init_check_handles():
    """Resolve and initialize check-geom ids and hide them by default."""
    global check_short_gid, check_long_gid, check_short_vis_gid, check_long_vis_gid
    try:
        check_short_gid = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, "check_short")
    except Exception:
        check_short_gid = -1
    try:
        check_long_gid = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, "check_long")
    except Exception:
        check_long_gid = -1
    try:
        check_short_vis_gid = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, "check_short_vis")
    except Exception:
        check_short_vis_gid = -1
    try:
        check_long_vis_gid = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, "check_long_vis")
    except Exception:
        check_long_vis_gid = -1

    # Debug: log resolved geom ids
    try:
        print(f"_init_check_handles: check_short={check_short_gid} check_long={check_long_gid} check_short_vis={check_short_vis_gid} check_long_vis={check_long_vis_gid}", flush=True)
    except Exception:
        pass
    # Hide all check geoms initially (alpha = 0)
    try:
        for gid in (check_short_gid, check_long_gid, check_short_vis_gid, check_long_vis_gid):
            if gid is None:
                continue
            try:
                if gid >= 0:
                    model.geom_rgba[gid] = np.array([0.0, 0.0, 0.0, 0.0])
                    if hasattr(model, 'geom_emission'):
                        model.geom_emission[gid] = 0.0
            except Exception:
                pass
    except Exception:
        pass


def _set_check_visibility(success: bool):
    """Show or hide the check geoms. If success=True, make them bright green; otherwise hide them."""
    global check_short_gid, check_long_gid, check_short_vis_gid, check_long_vis_gid
    # Ensure handles exist
    try:
        if (check_short_gid is None) or (check_long_gid is None) or (check_short_vis_gid is None) or (check_long_vis_gid is None):
            _init_check_handles()
    except Exception:
        try:
            _init_check_handles()
        except Exception:
            pass

    try:
        if success:
            col = np.array([0.08, 0.85, 0.12, 1.0])
            emis = 2.0
        else:
            col = np.array([0.0, 0.0, 0.0, 0.0])
            emis = 0.0

        for gid in (check_short_gid, check_long_gid, check_short_vis_gid, check_long_vis_gid):
            try:
                if gid is None or gid < 0:
                    continue
                model.geom_rgba[gid] = col
                if hasattr(model, 'geom_emission'):
                    model.geom_emission[gid] = emis
            except Exception:
                pass

        try:
            mj.mj_forward(model, data)
        except Exception:
            pass

        # attempt viewer sync
        try:
            import mj_pick_and_place.robot_api as _robot_api
            rinst = getattr(_robot_api, 'robot', None)
            if rinst is not None and getattr(rinst, 'viewer', None) is not None:
                try:
                    rinst.viewer.sync()
                except Exception:
                    pass
        except Exception:
            pass
    except Exception:
        pass


def ensure_screen_textures():
    """Ensure texture image assets for laptop success/fail exist.

    This function will create two PNG files under the scene `assets/`
    directory (`screen_success.png` and `screen_fail.png`) if they are
    not already present. Images are generated using Pillow (PIL). If
    Pillow is not installed, this is a no-op and the caller should
    continue — the scene will fall back to color-only display.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return

    assets_dir = (_HERE / "scenes" / "assets")
    try:
        assets_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    def make_image(path: Path, text: str, bg: tuple, fg=(255, 255, 255)):
        if path.exists():
            return
        try:
            # Create a square image for the screen texture
            w, h = 512, 512
            img = Image.new("RGBA", (w, h), bg + (255,))
            draw = ImageDraw.Draw(img)

            # If text is 'SUCCESS' we draw a green check graphic centered on the image.
            if str(text).upper().strip() == "SUCCESS":
                # Check parameters
                check_color = (24, 200, 80, 255)  # vivid green
                thickness = int(w * 0.08)

                # Points for a typical check shape (relative coordinates)
                p1 = (int(w * 0.18), int(h * 0.55))
                p2 = (int(w * 0.40), int(h * 0.72))
                p3 = (int(w * 0.82), int(h * 0.22))

                # Draw thick lines for the two legs
                try:
                    draw.line([p1, p2], fill=check_color, width=thickness)
                    draw.line([p2, p3], fill=check_color, width=thickness)
                except Exception:
                    # Older PIL may not support width parameter; draw multiple offset lines
                    for off in range(-thickness//2, thickness//2 + 1):
                        draw.line([(p1[0], p1[1]+off), (p2[0], p2[1]+off)], fill=check_color)
                        draw.line([(p2[0], p2[1]+off), (p3[0], p3[1]+off)], fill=check_color)

                # Add circular caps for smooth ends
                r = thickness // 2
                draw.ellipse([p1[0]-r, p1[1]-r, p1[0]+r, p1[1]+r], fill=check_color)
                draw.ellipse([p2[0]-r, p2[1]-r, p2[0]+r, p2[1]+r], fill=check_color)
                draw.ellipse([p3[0]-r, p3[1]-r, p3[0]+r, p3[1]+r], fill=check_color)
            else:
                # Default: render centered text
                try:
                    font = ImageFont.truetype("arial.ttf", 96)
                except Exception:
                    font = ImageFont.load_default()
                text = str(text)
                tw, th = draw.textsize(text, font=font)
                draw.text(((w - tw) / 2, (h - th) / 2), text, font=font, fill=fg + (255,))

            img.save(path.as_posix())
        except Exception:
            try:
                # Fallback tiny image
                img = Image.new("RGBA", (64, 32), bg + (255,))
                img.save(path.as_posix())
            except Exception:
                pass

    make_image(assets_dir / "screen_success.png", "SUCCESS", (0, 90, 60))
    make_image(assets_dir / "screen_fail.png", "FAIL", (70, 10, 10))


def init() -> tuple[mj.MjModel, mj.MjData]:
    """
    Initialize the MuJoCo simulation environment.

    Creates a scene with:
    - UR5e robot arm mounted at z=0.5m
    - Robotiq 2F-85 gripper attached to the arm

    Returns:
        tuple: (MuJoCo model, MuJoCo data)
    """
    # Ensure the images used for runtime laptop text exist before loading the scene
    try:
        ensure_screen_textures()
    except Exception:
        pass

    # Load the decorated scene and robot assets
    spec = mj.MjSpec().from_file((_HERE / "scenes/empty.xml").as_posix())
    arm = mj.MjSpec().from_file(ur5e_mj_description.MJCF_PATH)
    gripper = mj.MjSpec().from_file(robotiq_2f85_mj_description.MJCF_PATH)

    # Mount robot arm at 0.5 m height
    spec.worldbody.add_frame(pos=[0, 0, 0.5]).attach_body(arm.worldbody.first_body(), prefix="robot/")

    # Attach gripper to arm
    s: mj.MjsSite = arm.worldbody.find_all(mj.mjtObj.mjOBJ_SITE)[0]
    s.attach_body(gripper.worldbody.first_body(), prefix="gripper/")

    # Compile
    m = spec.compile()
    d = mj.MjData(m)
    return m, d


# Initialize the simulation model and data so other helpers can use them
model, data = init()


def show_solution_on_laptop():
    # Prefer the textured 'SUCCESS' display so the screen shows readable white text.
    try:
        return show_text_on_laptop("SUCCESS")
    except Exception:
        return set_laptop_screen(True)


def clear_laptop_solution_display():
    # Restore default appearance (fallback to simple color/material reset)
    try:
        _set_check_visibility(False)
    except Exception:
        pass
    return set_laptop_screen(False)


def show_text_on_laptop(text: str) -> bool:
    # Minimal reliable implementation: set laptop screen to green on success
    if text is None:
        return False

    t = str(text).strip().upper()
    success = t == "SUCCESS" or t == "OK"

    # Ensure handles are initialized
    if laptop_screen_geom_id is None or laptop_screen_geom_id < 0:
        _init_visual_handles()

    try:
        # Best-effort: acquire RobotAPI lock and viewer instance for atomic update
        lock = None
        robot_inst = None
        try:
            import mj_pick_and_place.robot_api as _robot_api
            robot_inst = getattr(_robot_api, 'robot', None)
            lock = getattr(robot_inst, 'data_lock', None)
        except Exception:
            lock = None

        gid = laptop_screen_geom_id if (laptop_screen_geom_id is not None) else -1
        if gid is None or gid < 0:
            return False

        # Green color used elsewhere in this module
        green = np.array([0.08, 0.85, 0.12, 1.0])
        target = green if success else LAPTOP_SCREEN_IDLE_RGBA

        try:
            if lock is not None:
                try:
                    lock.acquire()
                except Exception:
                    pass
            # Directly set geom rgba and emission (best-effort)
            try:
                model.geom_rgba[gid] = target
            except Exception:
                pass
            try:
                model.geom_emission[gid] = 1.5 if success else 0.0
            except Exception:
                pass
        finally:
            try:
                if lock is not None:
                    lock.release()
            except Exception:
                pass

        # Push forward kinematics and try to sync viewer so change is visible
        try:
            mj.mj_forward(model, data)
        except Exception:
            pass
        try:
            if robot_inst is not None and getattr(robot_inst, 'viewer', None) is not None:
                try:
                    robot_inst.viewer.sync()
                except Exception:
                    pass
        except Exception:
            pass

        return True
    except Exception as e:
        print(f"show_text_on_laptop failed: {e}", flush=True)
        return False


def clear_laptop_text():
    try:
        # Restore default appearance
        clear_laptop_solution_display()
        return True
    except Exception:
        return False


def _init_visual_handles():
    """Resolve geom and material ids used for runtime visual state toggles."""
    global laptop_screen_geom_id
    global laptop_screen_mat_id
    try:
        laptop_screen_geom_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM, "lab_laptop_screen")
    except Exception:
        laptop_screen_geom_id = -1
    try:
        laptop_screen_mat_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_MATERIAL, "screen_glow")
    except Exception:
        laptop_screen_mat_id = -1

    # Debug: log visual handle ids
    try:
        print(f"_init_visual_handles: laptop_screen_geom_id={laptop_screen_geom_id} laptop_screen_mat_id={laptop_screen_mat_id}", flush=True)
    except Exception:
        pass


_init_visual_handles()
_init_check_handles()
try:
    _set_check_visibility(False)
except Exception:
    pass
clear_laptop_solution_display()

# Save a lightweight snapshot of the initial simulation state so we can
# restore it in-place later without replacing the model/data objects the
# viewer holds. This is useful to reset the scene while keeping the
# viewer window open (many viewers keep strong references to the original
# model/data objects and don't accept replacements reliably).
_initial_data_snapshot = {}

def save_initial_state():
    """Capture copies of core arrays from `data` that are required to
    restore the scene to its initial configuration.

    This intentionally keeps the snapshot small (qpos, qvel, ctrl, time)
    and relies on `mj_forward` to recompute derived quantities.
    """
    global _initial_data_snapshot
    try:
        snap = {}
        try:
            snap['qpos'] = data.qpos.copy() if data.qpos is not None else None
        except Exception:
            snap['qpos'] = None
        try:
            snap['qvel'] = data.qvel.copy() if data.qvel is not None else None
        except Exception:
            snap['qvel'] = None
        try:
            snap['ctrl'] = data.ctrl.copy() if data.ctrl is not None else None
        except Exception:
            snap['ctrl'] = None
        try:
            snap['time'] = float(getattr(data, 'time', 0.0))
        except Exception:
            snap['time'] = 0.0
        _initial_data_snapshot = snap
    except Exception:
        _initial_data_snapshot = {}


def reset_to_initial() -> bool:
    """Restore the previously-saved initial state into the live `data`
    object in-place.

    Returns True on success, False otherwise. This function tries to copy
    array contents rather than replace the `data` object so viewers that
    hold references to the original `data` will immediately observe the
    restored state.
    """
    global _initial_data_snapshot
    if not _initial_data_snapshot:
        return False
    try:
        # Restore qpos/qvel/ctrl if shapes match
        try:
            if _initial_data_snapshot.get('qpos') is not None and data.qpos is not None and _initial_data_snapshot['qpos'].shape == data.qpos.shape:
                data.qpos[:] = _initial_data_snapshot['qpos']
        except Exception:
            pass
        try:
            if _initial_data_snapshot.get('qvel') is not None and data.qvel is not None and _initial_data_snapshot['qvel'].shape == data.qvel.shape:
                data.qvel[:] = _initial_data_snapshot['qvel']
        except Exception:
            pass
        try:
            if _initial_data_snapshot.get('ctrl') is not None and data.ctrl is not None and _initial_data_snapshot['ctrl'].shape == data.ctrl.shape:
                data.ctrl[:] = _initial_data_snapshot['ctrl']
        except Exception:
            pass

        # Restore time and recompute derived quantities
        try:
            data.time = _initial_data_snapshot.get('time', 0.0)
        except Exception:
            pass
        try:
            mj.mj_forward(model, data)
        except Exception:
            pass

        # Try to sync any active viewer so changes are visible immediately
        try:
            import mj_pick_and_place.robot_api as _robot_api
            rinst = getattr(_robot_api, 'robot', None)
            if rinst is not None and getattr(rinst, 'viewer', None) is not None:
                try:
                    rinst.viewer.sync()
                except Exception:
                    pass
        except Exception:
            pass

        return True
    except Exception:
        return False

# Capture the initial state now that model/data and visual handles are set up
try:
    save_initial_state()
except Exception:
    pass

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
    """Command the robot actuators to move to target joint positions."""
    # Note: This only sets commands to target angles; MuJoCo won't step the robot here.

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
    try:
        body_pos = data.body(body_id).xpos.copy()
    except Exception:
        body_pos = np.array([0.0, 0.0, 0.0])
    
    return body_pos


def set_body_pos(name, pos):
    """Move a body (teleport) to a new world-space position.

    This is a best-effort teleport used for dropping objects into the bag zone
    to avoid them staying glued to the robot or blocking future motions.
    """
    try:
        body_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY, name)
        if body_id < 0:
            return False
        # Write directly into data.xpos for the body and forward kinematics
        data.xpos[body_id, :] = np.array(pos, dtype=float)
        # Zero velocities for safety
        if data.qvel is not None:
            # best-effort: zero any floating joint velocities by setting qvel entries to 0
            try:
                # This is coarse; only set a slice equal to length of qvel
                data.qvel[:] = 0
            except Exception:
                pass
        mj.mj_forward(model, data)
    except Exception:
        return False

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
    obj_pos = get_body_pos("chloroform_syringe")  # Object to pick <---- Feel free to change
    drop_pos = get_body_pos("tedlar_bag_zone")  # Where to place object
    
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


"""
 # --- G. RACK WITH TUBES ---
    pos_rack = [0.70, -0.15, 0.52]
    body = spec.worldbody.add_body(name="test_tube_rack", pos=pos_rack)
    body.add_geom(name="rack_base", type=mj.mjtGeom.mjGEOM_BOX, size=[0.03, 0.10, 0.02],
                  rgba=[0.6, 0.4, 0.2, 1])
    body.add_geom(name="tube_1", type=mj.mjtGeom.mjGEOM_CYLINDER, pos=[0, -0.06, 0.04],
                  size=[0.008, 0.05, 0], material="glass_mat")
    body.add_geom(name="liq_1", type=mj.mjtGeom.mjGEOM_CYLINDER, pos=[0, -0.06, 0.02],
                  size=[0.006, 0.03, 0], rgba=[1, 1, 0, 1])
    body.add_geom(name="tube_2", type=mj.mjtGeom.mjGEOM_CYLINDER, pos=[0, 0.0, 0.04],
                  size=[0.008, 0.05, 0], material="glass_mat")
    body.add_geom(name="liq_2", type=mj.mjtGeom.mjGEOM_CYLINDER, pos=[0, 0.0, 0.03],
                  size=[0.006, 0.04, 0], rgba=[0, 1, 1, 1])
    body.add_geom(name="tube_3", type=mj.mjtGeom.mjGEOM_CYLINDER, pos=[0, 0.06, 0.04],
                  size=[0.008, 0.05, 0], material="glass_mat")
"""