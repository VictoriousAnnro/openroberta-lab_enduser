import * as LOG from 'log';
import * as GUISTATE_C from 'guiState.controller';
import * as $ from 'jquery';
// @ts-ignore
import * as Blockly from 'blockly';
import * as CONNECTION_C from 'connection.controller';
import * as GUISTATE from 'guiState.model';

let blocklyWorkspace;

//newmethod
let procedureMap; //map for procedures

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
/*God forgive me */
async function newRunBrick(){
    const apiUrl = 'http://127.0.0.1:5000'; // Flask app URL

    console.info("launching viewer!");
    //wait for viewer to be ready
    await getCall(apiUrl + '/viewer').then(_ => console.log('Have awaited launcing viewer'));

    let xmlProgram = Blockly.Xml.workspaceToDom(blocklyWorkspace);
    let xmlTextProgram = Blockly.Xml.domToText(xmlProgram); //delete later
    //console.info("xmlProgram: ", xmlProgram);
    console.info("xmlTextProgram: ", xmlTextProgram);
    //get all block-elements
    let blockElems = xmlProgram.getElementsByTagName("block");

    //put blocks in queue, and add procedure calls to map
    let queuedBlocks = queueBlocks(blockElems);
    // Run through the queued blocks via API
    await blockAPICalls(apiUrl, queuedBlocks);
}

function queueBlocks(blockElems){
    //gets blocks, puts in queue (array) and/or map depending on procedure or not
    let blockStack: Array<Element> = [];
    procedureMap = new Map<string, Array<Element>>(); //reset global map

    for (let index = 0; index < blockElems.length; index++) {
        const element = blockElems[index];
        if(element.getAttribute('type')=='robProcedures_defnoreturn'){ //defining custom block
            let procedureName = element.childNodes[1].childNodes[0].nodeValue;
            procedureMap.set(procedureName, element.childNodes[2].childNodes); //add stack element's children as procedure
            //move past the blocks nested in procedure - so we dont accidentally add the procedure to the queue again
            let nestedBlocks = element.getElementsByTagName("block");
            index += nestedBlocks.length;
        } else { //all other block types
            // add as 'next' in array
            blockStack.push(element);
        }
    }
    return blockStack;
}

async function blockAPICalls(apiUrl, blockElements){
    for (let index = 0; index < blockElements.length; index++) {
        const element = blockElements[index];
        console.info(element.getAttribute('type'));
        let url = '';
        //rn everything is just GET. Maybe POST is more correct but if it works why bother
        switch(element.getAttribute('type')){
            case 'naoActions_moveToPosition':
                //The values we want to get are nested like:
                // value, block, field, text.nodeValue (each being a xml element)
                //The x value in <field> x_value </field>, is treated as a childNode 
                let x = element.childNodes[0].childNodes[0].childNodes[0].childNodes[0].nodeValue;
                let y = element.childNodes[1].childNodes[0].childNodes[0].childNodes[0].nodeValue;
                let z = element.childNodes[2].childNodes[0].childNodes[0].childNodes[0].nodeValue;
                console.info("coordinates x, y and z: ", x, " ",  y, " ", z);
                url = apiUrl + '/move_pos/' + x + "/" + y + "/" + z;
                await getCall(url);
                continue;
            case 'naoActions_moveToObject':
                let obj = element.childNodes[0].childNodes[0].nodeValue;
                //console.info("move to object: ", obj);
                url = apiUrl + '/move_obj/' + obj;
                await getCall(url);
                continue;
            case 'naoActions_pickObject':
                //pickObject has field <field name="OBJECT">RED_OBJECT</field>
                //to get the actual value of the field, we must access the child's child
                obj = element.childNodes[0].childNodes[0].nodeValue;
                //console.info("pick object: ", obj);
                url = apiUrl + '/pick_obj/' + obj;
                await getCall(url);
                continue;
            case 'naoActions_grasp':
                url = apiUrl + '/grasp';
                await getCall(url);
                continue;
            case 'naoActions_release':
                url = apiUrl + '/release';
                await getCall(url);
                continue;
            case 'robControls_wait_time': //using OpenRoberta's pre-defined wait block - see WaitTimeStmt.java
                let seconds = element.childNodes[0].childNodes[0].childNodes[0].childNodes[0].nodeValue;
                url = apiUrl + '/wait/' + seconds;
                await getCall(url);
                continue;
            case 'robProcedures_callnoreturn': //NOTICE - it's _CALLnoreturn, not _DEFnoreturn 
                console.info("running through procedure!");
                // Call the corresponding procedure in procedureMap
                let procedureName = element.childNodes[0].getAttribute('name');
                console.info("procedure found: ", procedureName);
                if (procedureMap.has(procedureName)){
                    //call function recursively, to make api calls for all blocks in procedure
                    await blockAPICalls(apiUrl, procedureMap.get(procedureName));
                }
                continue;
        }  
    }
    return true;
}

async function getCall(url){
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
