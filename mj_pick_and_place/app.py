#Using Flask, we'll make the robot_api.py methods available here through a rest API
#In original code, we run in virtual environment. Otherwise you get problems with mujoco (cant find module)

# https://www.geeksforgeeks.org/python/python-build-a-rest-api-using-flask/
from flask import Flask, jsonify, request
from robot_api import robot
import time
from flask_cors import CORS, cross_origin
from pathlib import Path
import threading
import numpy as np
import sys
# Add parent directory to Python path to import sim module
sys.path.append(str(Path(__file__).parent.parent))

from sim import pnp  # Import low-level MuJoCo control functions

app = Flask(__name__)
#cors = CORS(app, resources={r"/api/*": {"origins": "http://localhost:1999/"}})
cors = CORS(app, origins=["http://localhost:1999/"])
app.config['CORS_HEADERS'] = 'Content-Type'

# set headers to prevent CORS issues
@app.after_request
def handle_options(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Requested-With"
    return response

# Launch viewer (no simulator loop)
@app.route("/viewer", methods = ['GET'])
@cross_origin()
def launch_view():
    # Launch viewer
    robot.launch_viewer()

    # Reset robot to home position!
    return robot.initialize()

# Deprecated method to run program - DONT USE
@app.route("/runProgram", methods = ['GET'])
@cross_origin()
def runProg():
    time.sleep(3)
    print("waited 3 sec")
    # Call the continous loop
    while robot.viewer.is_running(): #Until the user closes the window
        robot.step_simulation() #We execute one timestep
        time.sleep(robot.model.opt.timestep) #Maintain it real-time

# This runs the simulator loop
# I couldnt make it work as a thread, so the method is called each time a trajectory is added to queue
def runSimLoop(result):
    if result["status"] == "success":
        # Now execute the movement
        # print(robot.current_trajectory)
        while len(robot.current_trajectory) > 0:
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)  # Usually 0.005s

# This runs the simulator loop for grasp and release
# It's dealyed a bit, to give the gripper time to physically open/close
def runDelayedSimLoop(result):
    if result["status"] == "success":
        for _ in range(200): 
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)


def _execute_sequence(steps, success_message):
    """Utility to run a sequence of robot API calls with automatic stepping."""
    last_result = None
    for action_fn, args, runner in steps:
        result = action_fn(*args)
        print(result["status"])
        print(result["message"])
        if result["status"] != "success":
            return result
        if runner:
            runner(result)
        last_result = result
    return {"status": "success", "message": success_message if success_message else last_result["message"]}


# move_to_position(x, y, z, duration) -> Move end-effector to XYZ coordinates
@app.route("/move_pos/<int:x>/<int:y>/<int:z>", methods = ['GET'])
def move_to_pos(x, y, z):
    # CURRENTLY CANT HANDLE NEGATIVE VALUES. DO WE NEED NEGATIVES??**
    result = robot.move_to_position((x/100),(y/100),(z/100)) #convert cm to m
    print(result["status"])
    print(result["message"])

    runSimLoop(result)
    return result
    # move_to_position returns one of these messages
    # return {"status": "success", "message": f"Moving to ({x}, {y}, {z})"}
    # return {"status": "error", "message": str(e)}

# move_to_object(name, height_offset) -> Move above an object
@app.route("/move_obj/<string:name>", methods = ['GET'])
def move_to_obj(name):
    result = robot.move_to_object(name)
    print(result["status"])
    print(result["message"])

    runSimLoop(result)
    return result

# pick_object(name) -> Complete pick sequence (move down, grasp, move up the object)
@app.route("/pick_obj/<string:name>", methods = ['GET'])
def pick_obj(name):
    result = robot.pick_object(name)
    print(result["status"])
    print(result["message"])
    runSimLoop(result)
    return result

# grasp() ->Closes the gripper
@app.route("/grasp", methods = ['GET'])
def grasp():
    print('grasp')
    result = robot.grasp()
    print(result["status"])
    print(result["message"])
    runDelayedSimLoop(result)
    return result #robot.grasp()

# release() ->Opens gripper
@app.route("/release", methods = ['GET'])
def release():
    print('release')
    result = robot.release()
    print(result["status"])
    print(result["message"])
    runDelayedSimLoop(result)
    return result #robot.release()


@app.route("/mix_solution", methods=['GET'])
def mix_solution():
    center = robot.get_station_pose("mix_station")
    if center is None:
        return {"status": "error", "message": "Mix station pose unavailable"}

    hover = center + np.array([0.0, 0.0, 0.15])
    stir_height = center[2] + 0.035
    radius = 0.045

    def target_args(vec, duration):
        return (float(vec[0]), float(vec[1]), float(vec[2]), duration)

    swirl_offsets = [
        np.array([radius, 0.0, 0.0]),
        np.array([0.0, radius, 0.0]),
        np.array([-radius, 0.0, 0.0]),
        np.array([0.0, -radius, 0.0]),
    ]
    stir_anchor = center.copy()
    stir_anchor[2] = stir_height
    swirl_positions = [stir_anchor]
    for _ in range(2):
        for offset in swirl_offsets:
            swirl_positions.append(stir_anchor + offset)

    steps = [(robot.move_to_position, target_args(hover, 1.2), runSimLoop)]
    for pos in swirl_positions:
        steps.append((robot.move_to_position, target_args(pos, 0.6), runSimLoop))
    steps.append((robot.move_to_position, target_args(hover, 1.0), runSimLoop))

    result = _execute_sequence(steps, "Reagents mixed at stir station")
    if result["status"] == "success":
        robot.mark_solution_mixed()
    return result


@app.route("/analyze_solution", methods=['GET'])
def analyze_solution():
    if not robot.is_mixture_ready():
        return {"status": "error", "message": "Mix the reagents before analysis"}

    center = robot.get_station_pose("analysis_pad")
    if center is None:
        return {"status": "error", "message": "Analysis pad pose unavailable"}

    hover = center + np.array([0.0, 0.0, 0.14])
    contact = center + np.array([0.0, 0.0, 0.025])

    def target_args(vec, duration):
        return (float(vec[0]), float(vec[1]), float(vec[2]), duration)

    steps = [
        (robot.move_to_position, target_args(hover, 1.0), runSimLoop),
        (robot.move_to_position, target_args(contact, 0.8), runSimLoop),
        (robot.move_to_position, target_args(hover, 0.8), runSimLoop),
    ]
    result = _execute_sequence(steps, "Sample analyzed on scale pad")
    if result["status"] == "success":
        robot.mark_analysis_complete()
        result["solution_displayed"] = True
    else:
        result["solution_displayed"] = False
    return result

# wait(seconds) ->Pause execution
@app.route("/wait/<int:seconds>", methods = ['GET'])
def wait(seconds):
    return robot.wait(seconds)


# move up/down relative in Z (dz in centimeters)
@app.route("/move_up/<int:dz_cm>", methods=['GET'])
def move_up(dz_cm):
    dz = dz_cm / 100.0
    result = robot.move_by_z(dz)
    print(result.get("status"))
    print(result.get("message"))
    runSimLoop(result)
    return result


@app.route("/bag_full", methods=['GET'])
def bag_full():
    return robot.bag_is_full()


@app.route("/solution_ready", methods=['GET'])
def solution_ready():
    return robot.solution_state()


@app.route("/laptop_result", methods=['GET'])
def laptop_result():
    # Show SUCCESS if analysis_ready is True, otherwise show FAIL
    try:
        print("[app] /laptop_result called", flush=True)
        ready = robot.is_analysis_ready()
        print(f"[app] robot.is_analysis_ready={ready}", flush=True)
        # Use the minimal color-only toggle in the sim module. This avoids
        # texture/material logic and directly sets the geom color/emission.
        try:
            ok = pnp.set_laptop_screen(bool(ready))
            print(f"[app] pnp.set_laptop_screen({ready}) returned {ok}", flush=True)
            msg = "Shown SUCCESS on laptop" if ready else "Shown FAIL on laptop"
            return {"status": "success", "message": msg, "visible": bool(ok)}
        except Exception as e:
            print(f"[app] pnp.set_laptop_screen failed: {e}", flush=True)
            # Fall back to calling the text-rendering helper if available
            try:
                label_ok = pnp.show_text_on_laptop("SUCCESS" if ready else "FAIL")
                return {"status": "success", "message": "Shown (fallback) on laptop", "visible": bool(label_ok)}
            except Exception as e2:
                return {"status": "error", "message": f"Both set and text fallbacks failed: {e2}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.route("/restart_scene", methods=['GET'])
@cross_origin()
def restart_scene():
    """Re-initialize the MuJoCo scene and update robot references.

    This is a best-effort restart: it will attempt to stop the viewer, recompile
    the scene (calling pnp.init()), update the module-level `pnp.model`/`pnp.data`,
    reinitialize visual handles, and update the global `robot` instance to use
    the new model/data.
    """
    try:
        # Attempt to close viewer first to avoid dangling view state
        try:
            if getattr(robot, 'viewer_running', False):
                try:
                    robot.close_viewer()
                except Exception:
                    pass
        except Exception:
            pass

        # Recreate/compile the scene
        try:
            new_model, new_data = pnp.init()
            pnp.model = new_model
            pnp.data = new_data
        except Exception as e:
            return {"status": "error", "message": f"Failed to re-init scene: {e}"}

        # Re-initialize handles used for visuals
        try:
            if hasattr(pnp, '_init_visual_handles'):
                try:
                    pnp._init_visual_handles()
                except Exception:
                    pass
            if hasattr(pnp, '_init_check_handles'):
                try:
                    pnp._init_check_handles()
                except Exception:
                    pass
        except Exception:
            pass

        # Update robot instance references to point at the new model/data
        try:
            robot.model = pnp.model
            robot.data = pnp.data
        except Exception:
            pass

        return {"status": "success", "message": "Scene restarted"}

    except Exception as e:
        return {"status": "error", "message": str(e)}

# driver function
if __name__ == '__main__':
    robot.__init__()
    #app.run(debug = True)
    app.run()

# To run:
# flask --app app.py run
# or just flask run ?

# curl http://127.0.0.1:5000/<method_name>