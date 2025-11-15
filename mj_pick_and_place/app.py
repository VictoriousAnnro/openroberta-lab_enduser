#Using Flask, we'll make the robot_api.py methods available here through a rest API
#In original code, we run in virtual environment. Otherwise you get problems with mujoco (cant find module)
#How will this affect the API? Is that a problem?

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

simulator_thread = None # Thread running simulator loop

@app.after_request
def handle_options(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Requested-With"
    return response

@app.route("/", methods = ['GET'])
@cross_origin() #not sure if needed
def helloWorld():
    #return jsonify({'text': "hello world yaay"})
    #return "hello world yaaay"
    robot.launch_viewer()

    # Reset robot to home position!
    return robot.initialize()
# this seems to work! It launches the viewer at least, but also gives an error/warning in console.log. Now I need to test if the step loop works!!

# Launch viewer (no simulator loop)
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
@cross_origin()
def runProg():
    time.sleep(3)
    print("waited 3 sec")
    # Call the continous loop
    while robot.viewer.is_running(): #Until the user closes the window
        robot.step_simulation() #We execute one timestep
        time.sleep(robot.model.opt.timestep) #Maintain it real-time

def bitch():
    # Reset robot to home position
    #reset = robot.initialize()

    # Launch viewer (wait for method to return)
    launch = robot.launch_viewer()

    def simulator_loop():
        # Call the continous loop
        while robot.viewer.is_running(): #Until the user closes the window
            robot.step_simulation() #We execute one timestep
            time.sleep(robot.model.opt.timestep) #Maintain it real-time

    #simulator loop in a background thread
    simulator_thread = threading.Thread(target=simulator_loop, daemon=True)
    #self.viewer_thread.start()
    if(launch["status"]=="success"):
        time.sleep(3)  # 2s delay

        # Reset robot to home position
        #reset = robot.initialize()
        #print(reset["status"])

        #time.sleep(4)  # 1s delay

        # Call the continous loop in a thread
        simulator_thread.start()

        # Reset robot to home position
        #robot.initialize()

    return launch

def runSimLoop(result):
    if result["status"] == "success":
        # Now execute the movement
        print(robot.current_trajectory)
        while len(robot.current_trajectory) > 0:
            print("bitch")
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)  # Usually 0.005s


# move_to_position(x, y, z, duration) -> Move end-effector to XYZ coordinates
@app.route("/move_pos/<int:x>/<int:y>/<int:z>", methods = ['GET'])
def move_to_pos(x, y, z):
    print("you")
    result = robot.move_to_position(x/100,y/100,z/100)
    print("fuck")
    print(result["status"])
    print(result["message"])

    runSimLoop(result)

    """if result["status"] == "success":
        # Now execute the movement
        print(robot.current_trajectory)
        while len(robot.current_trajectory) > 0:
            print("bitch")
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)  # Usually 0.005s"""
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

    """if result["status"] == "success":
        # Now execute the movement
        print(robot.current_trajectory)
        while len(robot.current_trajectory) > 0:
            robot.step_simulation()
            time.sleep(robot.model.opt.timestep)  # Usually 0.005s"""
    return result
    #return robot.move_to_object(name)

# pick_object(name) -> Complete pick sequence (move down, grasp, move up the object)
@app.route("/pick_obj/<string:name>", methods = ['GET'])
def pick_obj(name):
    result = robot.pick_object(name)
    print(result["status"])
    print(result["message"])
    runSimLoop(result)
    return result #robot.pick_object(name)

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
# or just flask run ?

# curl http://127.0.0.1:5000/<method_name>