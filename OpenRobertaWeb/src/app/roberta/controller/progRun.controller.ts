import * as LOG from 'log';
import * as GUISTATE_C from 'guiState.controller';
import * as $ from 'jquery';
// @ts-ignore
import * as Blockly from 'blockly';
import * as CONNECTION_C from 'connection.controller';
import * as GUISTATE from 'guiState.model';
//newmethod
//import axios from 'axios';

let blocklyWorkspace;
//newmethod
const BASE_URL = "http://127.0.0.1:5000";

function init(workspace) {
    blocklyWorkspace = GUISTATE_C.getBlocklyWorkspace();
    initEvents();
}

function initEvents() {
    //newmethod
    Blockly.bindEvent_(blocklyWorkspace.robControls.newRunBrick, 'mousedown', null, function (e) {
        console.info('new run brick clicked!!');
        newRunBrick();
        //console.info(resp);
        return false;
    });
    Blockly.bindEvent_(blocklyWorkspace.robControls.runOnBrick, 'mousedown', null, function (e) {
        if ($('#runOnBrick').hasClass('disabled')) {
            let notificationElement = $('#releaseInfo');
            let notificationElementTitle = notificationElement.children('#releaseInfoTitle');
            let notificationElementDescription = notificationElement.children('#releaseInfoContent');
            notificationElementDescription.html(Blockly.Msg.POPUP_RUN_NOTIFICATION);
            notificationElementTitle.html(Blockly.Msg.POPUP_ATTENTION);
            let a = notificationElement.on('notificationFadeInComplete', function () {
                clearTimeout(a.data('hideInteval'));
                let id = setTimeout(function () {
                    notificationElement.fadeOut(500);
                }, 10000);
                a.data('hideInteval', id);
            });
            notificationElement.fadeIn(500, function () {
                $(this).trigger('notificationFadeInComplete');
            });

            return false;
        }
        LOG.info('runOnBrick from blockly button');
        runOnBrick();
        return false;
    });
    Blockly.bindEvent_(blocklyWorkspace.robControls.stopBrick, 'mousedown', null, function (e) {
        LOG.info('stopBrick from blockly button');
        stopProgram();
        return false;
    });
    Blockly.bindEvent_(blocklyWorkspace.robControls.stopProgram, 'mousedown', null, function (e) {
        LOG.info('stopProgram from blockly button');
        stopProgram();
        return false;
    });
}

/**
 * Start the program on brick from the source code editor
 */
function runNative(sourceCode) {
    let ping = GUISTATE_C.doPing();
    GUISTATE_C.setConnectionState('busy');
    GUISTATE_C.setPing(false);
    LOG.info('run ' + GUISTATE_C.getProgramName() + 'on brick from source code editor');
    CONNECTION_C.getConnectionInstance().runNative(sourceCode);
    GUISTATE_C.setPing(ping);
}

/**
 * Start the program on the brick
 */
function runOnBrick(opt_program?) {
    let ping = GUISTATE.server.ping;
    GUISTATE_C.setConnectionState('busy');
    GUISTATE_C.setPing(false);
    LOG.info('run ' + GUISTATE_C.getProgramName() + 'on brick');
    let xmlProgram;
    let xmlTextProgram;
    if (opt_program) {
        xmlTextProgram = opt_program;
    } else {
        xmlProgram = Blockly.Xml.workspaceToDom(blocklyWorkspace);
        xmlTextProgram = Blockly.Xml.domToText(xmlProgram);
    }
    let isNamedConfig = !GUISTATE_C.isConfigurationStandard() && !GUISTATE_C.isConfigurationAnonymous();
    let configName = isNamedConfig ? GUISTATE_C.getConfigurationName() : undefined;
    let xmlConfigText = GUISTATE_C.isConfigurationAnonymous() ? GUISTATE_C.getConfigurationXML() : undefined;

    CONNECTION_C.getConnectionInstance().runOnBrick(configName, xmlTextProgram, xmlConfigText);
    GUISTATE_C.setPing(ping);
}

//newmethod
/*This may be scuffed as fuck, but it's very difficult to figure out the architecture
of openRoberta well enough to follow it, so this will have to do */
async function newRunBrick(){
    /**This method should launch the viewer
     * TODO: figure out how to get the blocks in stack, call relevant api for them
     */
    const apiUrl = 'http://127.0.0.1:5000'; // Flask app URL

    console.info("launching viewer!");
    await getCall(apiUrl + '/viewer').then(_ => console.log('Have awaited launcing viewer'));
    //await getCall(apiUrl + '/viewer');
    //await getCall(apiUrl + '/runProgram');

    let xmlProgram = Blockly.Xml.workspaceToDom(blocklyWorkspace);
    console.info("xmlProgram: ", xmlProgram);
    let c = xmlProgram.getElementsByTagName("block");
    for (let index = 0; index < c.length; index++) {
        const element = c[index];
        let url = '';
        //rn everything is just GET. Maybe POST is more correct but if it works why bother
        switch(element.getAttribute('type')){
            case 'naoActions_moveToPosition':
                let x = element.childNodes[0].childNodes[0].childNodes[0].childNodes[0].nodeValue; //value, block, field, text.nodeValue
                let y = element.childNodes[1].childNodes[0].childNodes[0].childNodes[0].nodeValue;
                let z = element.childNodes[2].childNodes[0].childNodes[0].childNodes[0].nodeValue;
                console.info("coordinates x, y and z: ", x, " ",  y, " ", z);
                url = apiUrl + '/move_pos/' + x + "/" + y + "/" + z;
                await getCall(url);
                continue;
            case 'naoActions_moveToObject':
                let obj = element.childNodes[0].childNodes[0].nodeValue;
                console.info("move to object: ", obj);
                url = apiUrl + '/move_obj/' + obj;
                await getCall(url);
                continue;
            case 'naoActions_pickObject':
                //pickObject has field <field name="OBJECT">RED_OBJECT</field>
                //to get the actual value of the field, we must access the child's child
                obj = element.childNodes[0].childNodes[0].nodeValue;
                console.info("pick object: ", obj);
                url = apiUrl + '/pick_obj/' + obj;
                await getCall(url);
                continue;
            case 'naoActions_grasp':
                //we send no data with grasp and release, so make GET call
                url = apiUrl + '/grasp';
                await getCall(url);
                continue;
            case 'naoActions_release':
                url = apiUrl + '/release';
                await getCall(url);
                continue;
        }
        
    }
    //now all actions have been queued, run simulator loop
    //getCall(apiUrl + '/runProgram');

}

async function getCall(url){
    //console.log("lol");
    try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      return `Error from Python: ${data.error}`;
    }

    return data.result;
    } catch (error) {
        return `An error occurred: ${error}`;
    }
}


async function stopProgram() {
    CONNECTION_C.getConnectionInstance().stopProgram();
}

export { init, runNative, runOnBrick, newRunBrick };
