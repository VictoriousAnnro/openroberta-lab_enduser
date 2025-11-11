#Using Flask, we'll make the robot_api.py methods available here through a rest API
#In original code, we run in virtual environment. Otherwise you get problems with mujoco (cant find module)
#How will this affect the API? Is that a problem?

# https://www.geeksforgeeks.org/python/python-build-a-rest-api-using-flask/
from flask import Flask, jsonify, request
from flask_cors import CORS, cross_origin
from robot_api import robot
import time

app = Flask(__name__)
CORS(app)

@app.route("/", methods = ['GET'])
def helloWorld():
    return "hello world yaaaay"

# DONT USE THIS!!
@app.route("/viewer", methods = ['GET'])
def launch_view():
    # Launch viewer
    robot.launch_viewer()

    # Reset robot to home position!
    return robot.initialize()

# this launches viewer, resets position and loops
# I think we need to have this called once as separate thread
# like, it needs to NOT block the calls we then make to the other methods
@app.route("/runProgram", methods = ['GET'])
def runProg():
    # Launch viewer
    robot.launch_viewer()
    # Reset robot to home position
    robot.initialize()
    # Call the continous loop
    while robot.viewer.is_running(): #Until the user closes the window
        robot.step_simulation() #We execute one timestep
        time.sleep(robot.model.opt.timestep) #Maintain it real-time

# Whats the best way to get the parameters???

# move_to_position(x, y, z, duration) -> Move end-effector to XYZ coordinates
@app.route("/move_pos/<int:x>/<int:y>/<int:z>/<int:duration>", methods = ['GET'])
def move_to_pos(x, y, z, duration):
    return robot.move_to_position(x, y, z, duration)
    # move_to_position returns one of these messages
    # return {"status": "success", "message": f"Moving to ({x}, {y}, {z})"}
    # return {"status": "error", "message": str(e)}

# move_to_object(name, height_offset) -> Move above an object
@app.route("/move_obj/<string:name>/<int:height_offset>", methods = ['GET'])
def move_to_obj(name, height_offset):
    return robot.move_to_object(name, height_offset)

# pick_object(name) -> Complete pick sequence (move down, grasp, move up the object)
@app.route("/pick_obj/<string:name>", methods = ['GET'])
def pick_obj(name):
    return robot.pick_object(name)

# grasp() ->Closes the gripper
@app.route("/grasp", methods = ['GET'])
def grasp():
    return robot.grasp()

# release() ->Opens gripper
@app.route("/release", methods = ['GET'])
def release():
    return robot.release()

# wait(seconds) ->Pause execution
@app.route("/wait/<int:seconds>", methods = ['GET'])
def wait(seconds):
    return robot.wait(seconds)

# driver function
if __name__ == '__main__':
    robot.__init__()
    #app.run(debug = True)
    app.run()

# To run:
# flask --app app.py run

# curl http://127.0.0.1:5000/<method_name>