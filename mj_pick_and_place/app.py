#Using Flask, we'll make the robot_api.py methods available here through a rest API
#In original code, we run in virtual environment. Otherwise you get problems with mujoco (cant find module)

# https://www.geeksforgeeks.org/python/python-build-a-rest-api-using-flask/
from flask import Flask, jsonify, request
from robot_api import robot
import time
from flask_cors import CORS, cross_origin
import threading

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
# or just flask run ?

# curl http://127.0.0.1:5000/<method_name>