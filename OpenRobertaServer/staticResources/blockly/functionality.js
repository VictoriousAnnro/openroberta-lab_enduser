/**
 * Custom Procedures and Function Auto-Creator
 * 
 * This module provides:
 * - Block definitions: robProcedures_mutatorarg, robProcedures_mutatorcontainer,
 *   customProcedures_defnoreturn, customProcedures_callnoreturn
 * - Auto-creation of functions from repeated block sequences
 * - Literal parameter extraction and replacement
 * - Mutator UI for adding/removing typed parameters
 * - Visual highlighting and sequence detection
 */

var customFunctionRegistry = {};
var toastPromptShown = false;




  function showToastPrompt(message, onConfirm, onCancel) {
  const toast = document.createElement("div");
  toast.className = "toast-prompt";
  toast.innerHTML = `
    <div class="toast-message">${message}</div>
    <div class="toast-buttons">
      <button class="toast-cancel">No</button>
      <button class="toast-ok">Yes</button>
    </div>
  `;
  document.body.appendChild(toast);

  toast.querySelector(".toast-ok").onclick = () => { toast.remove(); onConfirm(); };
  toast.querySelector(".toast-cancel").onclick = () => { toast.remove(); onCancel(); };
}



function cloneRobertaBlock(block, workspace, deep = true) {
    if (!block) return null;

    // Create block of same type
    const clone = workspace.newBlock(block.type);

    // Copy fields
    block.inputList.forEach(input => {
        input.fieldRow.forEach(field => {
            if (field.name && typeof field.getValue === "function") {
                try {
                    const param = literalParams.find(p => p.fieldName === field.name);
                    if (param) {
                        // Replace literal with variable reference block
                        const varBlock = workspace.newBlock("variables_get");
                        varBlock.setFieldValue(param.paramName, "VAR");
                        varBlock.initSvg();
                        varBlock.render();

                        const target = clone.getInput(input.name)?.connection;
                        if (target && varBlock.outputConnection) {
                            target.connect(varBlock.outputConnection);
                        }
                    } else {
                        clone.setFieldValue(field.getValue(), field.name);
                    }

                } catch (e) {}
            }
        });
    });

    // Copy children (ONLY if deep)
    if (deep) {
        block.inputList.forEach(input => {
            const origConn = input.connection;
            if (!origConn) return;

            const child = origConn.targetBlock();
            if (!child) return;

            const targetConn = clone.getInput(input.name)?.connection;
            if (!targetConn) return;

            // Value input → clone a single block/tree
            if (targetConn.type === Blockly.INPUT_VALUE) {
                const clonedChild = safeCloneBlock(child, workspace);
                wipeConnections(clonedChild);
                if (clonedChild?.outputConnection) {
                    targetConn.connect(clonedChild.outputConnection);
                }
                return;
            }

            // Statement input → clone full statement chain in order
            if (targetConn.type === Blockly.NEXT_STATEMENT ||
                targetConn.type === Blockly.PREVIOUS_STATEMENT) {

                // Gather statement chain
                const chain = [];
                let c = child;
                while (c) {
                    chain.push(c);
                    c = c.getNextBlock();
                }

                // Clone in correct order
                let firstClone = null;
                let prevClone = null;
                for (let b of chain) {
                    const cloned = safeCloneBlock(b, workspace);
                    wipeConnections(cloned);

                    if (!firstClone) {
                        firstClone = cloned;
                        if (firstClone.previousConnection) {
                            targetConn.connect(firstClone.previousConnection);
                        }
                    } else if (prevClone.nextConnection && cloned.previousConnection) {
                        prevClone.nextConnection.connect(cloned.previousConnection);
                    }
                    prevClone = cloned;
                }
            }
        });
    }

    clone.initSvg();
    clone.render();
    return clone;
}

function safeCloneBlock(block, workspace) {
    if (!block) return null;

    // Clone top block deeply
    const cloneTop = cloneRobertaBlock(block, workspace, true);
    wipeConnections(cloneTop);

    // Collect original next-chain
    const chain = [];
    let cursor = block.getNextBlock();
    while (cursor) {
        chain.push(cursor);
        cursor = cursor.getNextBlock();
    }

    // Clone bottom → top (so order is preserved)
    let prevClone = cloneTop;
    for (let i = chain.length - 1; i >= 0; i--) {
        const orig = chain[i];
        const cloned = cloneRobertaBlock(orig, workspace, true);
        wipeConnections(cloned);

        if (prevClone.nextConnection && cloned.previousConnection) {
            prevClone.nextConnection.connect(cloned.previousConnection);
        }

        prevClone = cloned;
    }

    return cloneTop;
}



function insertProcedureCall(group, name) {
    const call = workspace.newBlock("customProcedures_callnoreturn");
    call.setFieldValue(name, "NAME");

    const literalParams = extractLiteralParameters(group);

    if (literalParams.length > 0) {
        const mutation = document.createElement("mutation");
        literalParams.forEach(p => {
            const arg = document.createElement("arg");
            arg.setAttribute("name", p.paramName);
            // pass type as well (customProcedures_callnoreturn will ignore unknown attrs if necessary)
            arg.setAttribute("type", p.type);
            mutation.appendChild(arg);
        });
        call.domToMutation(mutation);
    }

    call.initSvg();
    call.render();

    // If we have literal parameters, plug them into the call's argument inputs
    if (literalParams.length > 0) {
        for (let i = 0; i < literalParams.length; i++) {
            const p = literalParams[i];
            const input = call.getInput('ARG' + i);
            if (!input) continue;

            // Create a simple literal/shadow block according to type
            let litBlock = null;
            if (p.type === 'Number') {
                litBlock = workspace.newBlock('math_number');
                try { litBlock.setFieldValue(String(p.originalValue), 'NUM'); } catch (e) {}
            } else if (p.type === 'String') {
                litBlock = workspace.newBlock('text');
                try { litBlock.setFieldValue(String(p.originalValue), 'TEXT'); } catch (e) {}
            } else {
                // Fallback: create a text shadow with stringified value
                litBlock = workspace.newBlock('text');
                try { litBlock.setFieldValue(String(p.originalValue), 'TEXT'); } catch (e) {}
            }

            if (litBlock) {
                litBlock.initSvg();
                litBlock.render();
                try {
                    if (input.connection && litBlock.outputConnection) {
                        input.connection.connect(litBlock.outputConnection);
                    }
                } catch (e) {}
            }
        }
    }


    const first = group[0];
    const last = group[group.length - 1];

    const parent = first.previousConnection?.targetBlock();
    const next   = last.nextConnection?.targetBlock();

    if (parent?.nextConnection) {
        parent.nextConnection.connect(call.previousConnection);
    }

    if (next) {
        call.nextConnection.connect(next.previousConnection);
    }

    group.forEach(b => safeDispose(b));
}
// Remove any accidental auto-connections so Blockly doesn't reorder things.
function wipeConnections(block) {
    if (!block) return;

    if (block.previousConnection && block.previousConnection.targetConnection) {
        try { block.previousConnection.disconnect(); } catch (e) {}
    }
    if (block.nextConnection && block.nextConnection.targetConnection) {
        try { block.nextConnection.disconnect(); } catch (e) {}
    }

    block.inputList.forEach(input => {
        const child = input.connection?.targetBlock();
        if (child) wipeConnections(child);
    });
}

function serializeBlockMinimal(block) {
    const json = {
        type: block.type,
        fields: {},
    };

    // Serialize only fields (OpenRoberta uses custom field types)
    block.inputList.forEach(input => {
        input.fieldRow.forEach(field => {
            if (field.name && typeof field.getValue === "function") {
                json.fields[field.name] = field.getValue();
            }
        });
    });

    return json;
}



    function makeBlock(type, workspace, fields = {}, children = {}) {
    const block = workspace.newBlock(type);

    // Set all field values
    Object.keys(fields).forEach(name => {
        try { block.setFieldValue(fields[name], name); } catch (e) {}
    });

    // Create + connect children blocks
    Object.keys(children).forEach(inputName => {
        const childSpec = children[inputName];
        const childBlock = makeBlock(childSpec.type, workspace, childSpec.fields, childSpec.children);

        const conn = block.getInput(inputName)?.connection;
        if (conn && childBlock.previousConnection) {
            conn.connect(childBlock.previousConnection);
        }
    });

    block.initSvg();
    block.render();
    return block;
}




function buildTestCase(ws, offsetX = 30, offsetY = 30) {

    /**********************************************
     * First Sequence
     **********************************************/
    const start = ws.newBlock("robControls_start");
    start.initSvg(); start.render();
    start.moveBy(offsetX, offsetY);

    const if1 = ws.newBlock("controls_if");
    if1.initSvg(); if1.render();
    start.nextConnection.connect(if1.previousConnection);

    // Condition for IF1
    const cond1 = ws.newBlock("logic_compare");
    cond1.initSvg(); cond1.render();
    if1.getInput("IF0").connection.connect(cond1.outputConnection);

    const numLeft1 = ws.newBlock("math_number");
    numLeft1.setFieldValue("5", "NUM");
    numLeft1.initSvg(); numLeft1.render();
    cond1.getInput("A").connection.connect(numLeft1.outputConnection);

    const numRight1 = ws.newBlock("math_number");
    numRight1.setFieldValue("10", "NUM");
    numRight1.initSvg(); numRight1.render();
    cond1.getInput("B").connection.connect(numRight1.outputConnection);

    // print inside IF1
    const printInside1 = ws.newBlock("text_print");
    printInside1.initSvg(); printInside1.render();
    if1.getInput("DO0").connection.connect(printInside1.previousConnection);

    const txtInside1 = ws.newBlock("text");
    txtInside1.setFieldValue("This", "TEXT");
    txtInside1.initSvg(); txtInside1.render();
    printInside1.getInput("TEXT").connection.connect(txtInside1.outputConnection);


    // REPEAT1
    const repeat1 = ws.newBlock("controls_repeat_ext");
    repeat1.initSvg(); repeat1.render();
    if1.nextConnection.connect(repeat1.previousConnection);

    const repeatCount1 = ws.newBlock("math_number");
    repeatCount1.setFieldValue("3", "NUM");
    repeatCount1.initSvg(); repeatCount1.render();
    repeat1.getInput("TIMES").connection.connect(repeatCount1.outputConnection);

    // print inside REPEAT1
    const print2 = ws.newBlock("text_print");
    print2.initSvg(); print2.render();
    repeat1.getInput("DO").connection.connect(print2.previousConnection);

    const txt2_1 = ws.newBlock("text");
    txt2_1.setFieldValue("is", "TEXT");
    txt2_1.initSvg(); txt2_1.render();
    print2.getInput("TEXT").connection.connect(txt2_1.outputConnection);

    // print AFTER REPEAT1
    const print3 = ws.newBlock("text_print");
    print3.initSvg(); print3.render();
    repeat1.nextConnection.connect(print3.previousConnection);

    const txt3_1 = ws.newBlock("text");
    txt3_1.setFieldValue("a testcase", "TEXT");
    txt3_1.initSvg(); txt3_1.render();
    print3.getInput("TEXT").connection.connect(txt3_1.outputConnection);


    /**********************************************
     * Second Sequence (offset vertically)
     **********************************************/
    const offsetY2 = offsetY + 250; // shift down

    const if2 = ws.newBlock("controls_if");
    if2.initSvg(); if2.render();
    print3.nextConnection.connect(if2.previousConnection);

    if2.moveBy(0, 200);  // push second sequence lower


    // Condition for IF2
    const cond2 = ws.newBlock("logic_compare");
    cond2.initSvg(); cond2.render();
    if2.getInput("IF0").connection.connect(cond2.outputConnection);

    const numLeft2 = ws.newBlock("math_number");
    numLeft2.setFieldValue("20", "NUM");
    numLeft2.initSvg(); numLeft2.render();
    cond2.getInput("A").connection.connect(numLeft2.outputConnection);

    const numRight2 = ws.newBlock("math_number");
    numRight2.setFieldValue("15", "NUM");
    numRight2.initSvg(); numRight2.render();
    cond2.getInput("B").connection.connect(numRight2.outputConnection);


    // print inside IF2
    const printInside2 = ws.newBlock("text_print");
    printInside2.initSvg(); printInside2.render();
    if2.getInput("DO0").connection.connect(printInside2.previousConnection);

    const txtInside2 = ws.newBlock("text");
    txtInside2.setFieldValue("because", "TEXT");
    txtInside2.initSvg(); txtInside2.render();
    printInside2.getInput("TEXT").connection.connect(txtInside2.outputConnection);


    // REPEAT2
    const repeat2 = ws.newBlock("controls_repeat_ext");
    repeat2.initSvg(); repeat2.render();
    if2.nextConnection.connect(repeat2.previousConnection);

    const repeatCount2 = ws.newBlock("math_number");
    repeatCount2.setFieldValue("2", "NUM");
    repeatCount2.initSvg(); repeatCount2.render();
    repeat2.getInput("TIMES").connection.connect(repeatCount2.outputConnection);

    // print inside REPEAT2
    const print4 = ws.newBlock("text_print");
    print4.initSvg(); print4.render();
    repeat2.getInput("DO").connection.connect(print4.previousConnection);

    const txt4 = ws.newBlock("text");
    txt4.setFieldValue("we are", "TEXT");
    txt4.initSvg(); txt4.render();
    print4.getInput("TEXT").connection.connect(txt4.outputConnection);

    // print AFTER REPEAT2
    const print5 = ws.newBlock("text_print");
    print5.initSvg(); print5.render();
    repeat2.nextConnection.connect(print5.previousConnection);

    const txt5 = ws.newBlock("text");
    txt5.setFieldValue("bored", "TEXT");
    txt5.initSvg(); txt5.render();
    print5.getInput("TEXT").connection.connect(txt5.outputConnection);


    return {
        start,
        last: print5,

        // first chain
        if1, repeat1, printInside1, print2, print3,

        // second chain
        if2, repeat2, printInside2, print4, print5
    };
}

function buildLargeTestCase(ws, offsetX = 30, offsetY = 30) {

    /**********************************************
     * Sequence 1 — simple IF + REPEAT
     **********************************************/
    const start = ws.newBlock("robControls_start");
    start.initSvg(); start.render();
    start.moveBy(offsetX, offsetY);

    const if1 = ws.newBlock("controls_if");
    if1.initSvg(); if1.render();
    start.nextConnection.connect(if1.previousConnection);

    // IF1 condition (5 < 10)
    const cond1 = ws.newBlock("logic_compare");
    cond1.initSvg(); cond1.render();
    if1.getInput("IF0").connection.connect(cond1.outputConnection);

    const num1A = ws.newBlock("math_number");
    num1A.setFieldValue("5", "NUM");
    num1A.initSvg(); num1A.render();
    cond1.getInput("A").connection.connect(num1A.outputConnection);

    const num1B = ws.newBlock("math_number");
    num1B.setFieldValue("10", "NUM");
    num1B.initSvg(); num1B.render();
    cond1.getInput("B").connection.connect(num1B.outputConnection);

    // Console print
    const print1 = ws.newBlock("text_print");
    print1.initSvg(); print1.render();
    if1.getInput("DO0").connection.connect(print1.previousConnection);

    const txt1 = ws.newBlock("text");
    txt1.setFieldValue("Start of Large Testcase", "TEXT");
    txt1.initSvg(); txt1.render();
    print1.getInput("TEXT").connection.connect(txt1.outputConnection);

    // REPEAT 4
    const repeat1 = ws.newBlock("controls_repeat_ext");
    repeat1.initSvg(); repeat1.render();
    if1.nextConnection.connect(repeat1.previousConnection);

    const repeatCount1 = ws.newBlock("math_number");
    repeatCount1.setFieldValue("4", "NUM");
    repeatCount1.initSvg(); repeatCount1.render();
    repeat1.getInput("TIMES").connection.connect(repeatCount1.outputConnection);

    // inside REPEAT1 → print
    const printRep1 = ws.newBlock("text_print");
    printRep1.initSvg(); printRep1.render();
    repeat1.getInput("DO").connection.connect(printRep1.previousConnection);

    const txtRep1 = ws.newBlock("text");
    txtRep1.setFieldValue("Looping...", "TEXT");
    txtRep1.initSvg(); txtRep1.render();
    printRep1.getInput("TEXT").connection.connect(txtRep1.outputConnection);


    /**********************************************
     * Sequence 2 — nested IF inside REPEAT + boolean logic
     **********************************************/

    const repeat2 = ws.newBlock("controls_repeat_ext");
    repeat2.initSvg(); repeat2.render();
    repeat1.nextConnection.connect(repeat2.previousConnection);

    const repeatCount2 = ws.newBlock("math_number");
    repeatCount2.setFieldValue("3", "NUM");
    repeatCount2.initSvg(); repeatCount2.render();
    repeat2.getInput("TIMES").connection.connect(repeatCount2.outputConnection);

    // inside REPEAT2 → IF
    const if2 = ws.newBlock("controls_if");
    if2.initSvg(); if2.render();
    repeat2.getInput("DO").connection.connect(if2.previousConnection);

    // IF2 condition = (20 > 15 AND TRUE)
    const logicAnd = ws.newBlock("logic_operation");
    logicAnd.setFieldValue("AND", "OP");
    logicAnd.initSvg(); logicAnd.render();
    if2.getInput("IF0").connection.connect(logicAnd.outputConnection);

    const condLeft = ws.newBlock("logic_compare");
    condLeft.initSvg(); condLeft.render();
    logicAnd.getInput("A").connection.connect(condLeft.outputConnection);

    const num2A = ws.newBlock("math_number");
    num2A.setFieldValue("20", "NUM");
    num2A.initSvg(); num2A.render();
    condLeft.getInput("A").connection.connect(num2A.outputConnection);

    const num2B = ws.newBlock("math_number");
    num2B.setFieldValue("15", "NUM");
    num2B.initSvg(); num2B.render();
    condLeft.getInput("B").connection.connect(num2B.outputConnection);

    const boolTrue = ws.newBlock("logic_boolean");
    boolTrue.setFieldValue("TRUE", "BOOL");
    boolTrue.initSvg(); boolTrue.render();
    logicAnd.getInput("B").connection.connect(boolTrue.outputConnection);

    // inside IF2 → print
    const printInside2 = ws.newBlock("text_print");
    printInside2.initSvg(); printInside2.render();
    if2.getInput("DO0").connection.connect(printInside2.previousConnection);

    const txtInside2 = ws.newBlock("text");
    txtInside2.setFieldValue("Nested IF triggered", "TEXT");
    txtInside2.initSvg(); txtInside2.render();
    printInside2.getInput("TEXT").connection.connect(txtInside2.outputConnection);


    /**********************************************
     * Sequence 3 — WHILE loop + math + second IF
     **********************************************/

    const while1 = ws.newBlock("controls_whileUntil");
    while1.setFieldValue("WHILE", "MODE");
    while1.initSvg(); while1.render();
    repeat2.nextConnection.connect(while1.previousConnection);

    // While condition = (counter < 5)
    const condWhile = ws.newBlock("logic_compare");
    condWhile.initSvg(); condWhile.render();
    while1.getInput("BOOL").connection.connect(condWhile.outputConnection);

    const counterVar = ws.newBlock("variables_get");
    counterVar.setFieldValue("counter", "VAR");
    counterVar.initSvg(); counterVar.render();
    condWhile.getInput("A").connection.connect(counterVar.outputConnection);

    const num5 = ws.newBlock("math_number");
    num5.setFieldValue("5", "NUM");
    num5.initSvg(); num5.render();
    condWhile.getInput("B").connection.connect(num5.outputConnection);

    // inside WHILE → another IF
    const if3 = ws.newBlock("controls_if");
    if3.initSvg(); if3.render();
    while1.getInput("DO").connection.connect(if3.previousConnection);

    // IF3 condition counter % 2 == 0
    const mathMod = ws.newBlock("math_modulo");
    mathMod.initSvg(); mathMod.render();
    if3.getInput("IF0").connection.connect(mathMod.outputConnection);

    const varMod = ws.newBlock("variables_get");
    varMod.setFieldValue("counter", "VAR");
    varMod.initSvg(); varMod.render();
    mathMod.getInput("DIVIDEND").connection.connect(varMod.outputConnection);

    const num2 = ws.newBlock("math_number");
    num2.setFieldValue("2", "NUM");
    num2.initSvg(); num2.render();
    mathMod.getInput("DIVISOR").connection.connect(num2.outputConnection);

    const num0 = ws.newBlock("math_number");
    num0.setFieldValue("0", "NUM");
    num0.initSvg(); num0.render();

    const condEq = ws.newBlock("logic_compare");
    condEq.initSvg(); condEq.render();
    condEq.getInput("A").connection.connect(mathMod.outputConnection);
    condEq.getInput("B").connection.connect(num0.outputConnection);
    if3.getInput("IF0").connection.disconnect();
    if3.getInput("IF0").connection.connect(condEq.outputConnection);

    // inside IF3 → print even number
    const printEven = ws.newBlock("text_print");
    printEven.initSvg(); printEven.render();
    if3.getInput("DO0").connection.connect(printEven.previousConnection);

    const txtEven = ws.newBlock("text");
    txtEven.setFieldValue("Even iteration", "TEXT");
    txtEven.initSvg(); txtEven.render();
    printEven.getInput("TEXT").connection.connect(txtEven.outputConnection);

    // After WHILE → final print
    const finalPrint = ws.newBlock("text_print");
    finalPrint.initSvg(); finalPrint.render();
    while1.nextConnection.connect(finalPrint.previousConnection);

    const txtFinal = ws.newBlock("text");
    txtFinal.setFieldValue("End of large testcase", "TEXT");
    txtFinal.initSvg(); txtFinal.render();
    finalPrint.getInput("TEXT").connection.connect(txtFinal.outputConnection);

    return {
        start,
        last: finalPrint,

        // exposed blocks
        if1, repeat1, print1, printRep1,
        if2, repeat2,
        while1, if3,
        finalPrint
    };
}


function mixColors(color1, color2, amount) {
    function hexToRgb(hex) {
        hex = hex.replace("#", "");
        let b = parseInt(hex, 16);
        return {
            r: (b >> 16) & 255,
            g: (b >> 8) & 255,
            b: b & 255
        };
    }

    amount = Math.max(0, Math.min(1, amount));

    let c1 = hexToRgb(color1);
    let c2 = hexToRgb(color2);

    return `rgb(${
        Math.round(c1.r + (c2.r - c1.r) * amount)
    },${
        Math.round(c1.g + (c2.g - c1.g) * amount)
    },${
        Math.round(c1.b + (c2.b - c1.b) * amount)
    })`;
}



function runTest() {
         

    

    

    

    //highlightOnlyFunctionCandidates(workspace, blocks[0]); // start block

    console.log("Test done");
}
function run2ndTest() {
         

    

    buildTestCase(workspace)

    

    //highlightOnlyFunctionCandidates(workspace, blocks[0]); // start block

    console.log("Test done");
}

// ============================================================================
// BLOCK DEFINITIONS
// ============================================================================

/**
 * Define the robProcedures_mutatorarg block with parameter type support
 */
Blockly.Blocks['robProcedures_mutatorarg'] = {
  init: function() {
    var typeOptions = [
      ['Number', 'Number'],
      ['Boolean', 'Boolean'],
      ['String', 'String'],
      ['Colour', 'Colour'],
      ['Image', 'Image'],
      ['List Number', 'List Number'],
      ['List Boolean', 'List Boolean'],
      ['List String', 'List String'],
      ['List Colour', 'List Colour'],
      ['List Image', 'List Image']
    ];
    
    this.appendDummyInput()
        .appendField('argument:')
        .appendField(new Blockly.FieldTextInput('x', this.validator_), 'NAME')
        .appendField(new Blockly.FieldDropdown(typeOptions), 'VARTYPE');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(Blockly.CAT_PROCEDURE_RGB);
    this.setTooltip('Argument for a custom block');
    this.contextMenu = false;
  },
  validator_: function(newVar) {
    newVar = newVar.replace(/[\s\xa0]+/g, ' ').replace(/^ | $/g, '');
    return newVar || null;
  },
  mutationToDom: function() {
    var container = document.createElement('mutation');
    var vartype = this.getFieldValue('VARTYPE');
    if (vartype) {
      container.setAttribute('vartype', vartype);
    }
    return container;
  },
  domToMutation: function(xmlElement) {
    var vartype = xmlElement.getAttribute('vartype');
    if (vartype) {
      this.setFieldValue(vartype, 'VARTYPE');
    }
  }
};

/**
 * Define the procedures_mutatorcontainer block
 */
Blockly.Blocks['procedures_mutatorcontainer'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Arguments');
    this.appendStatementInput('STACK');
    this.setColour(Blockly.CAT_PROCEDURE_RGB);
    this.setTooltip('Add parameters to your custom block');
    this.contextMenu = false;
  }
};

/**
 * Custom procedure definition block with proper type support
 */
Blockly.Blocks['customProcedures_defnoreturn'] = {
  init: function() {
    this.setHelpUrl(Blockly.Msg.PROCEDURES_DEFNORETURN_HELPURL);
    this.setColour(Blockly.CAT_PROCEDURE_RGB);
    var name = Blockly.Procedures.findLegalName(Blockly.Msg.PROCEDURES_DEFNORETURN_PROCEDURE, this);
    var nameField = new Blockly.FieldTextInput(name, Blockly.Procedures.rename);
    nameField.setSpellcheck(false);
    this.appendDummyInput()
        .appendField(Blockly.Msg.PROCEDURES_DEFNORETURN_TITLE)
        .appendField(nameField, 'NAME')
        .appendField('', 'PARAMS');
    this.appendStatementInput('STACK')
        .appendField(Blockly.Msg.PROCEDURES_DEFNORETURN_DO);
    this.setMutator(new Blockly.Mutator(['robProcedures_mutatorarg']));
    this.setTooltip(Blockly.Msg.PROCEDURES_DEFNORETURN_TOOLTIP);
    this.arguments_ = [];
    this.argumentsTypes_ = [];
  },
  getProcedureDef: function() {
    return [this.getFieldValue('NAME'), this, false];
  },
  mutationToDom: function() {
    var container = document.createElement('mutation');
    container.setAttribute('name', this.getFieldValue('NAME'));
    for (var i = 0; i < this.arguments_.length; i++) {
      var parameter = document.createElement('arg');
      parameter.setAttribute('name', this.arguments_[i]);
      parameter.setAttribute('type', this.argumentsTypes_[i] || 'Number');
      container.appendChild(parameter);
    }
    return container;
  },
  domToMutation: function(xmlElement) {
    this.arguments_ = [];
    this.argumentsTypes_ = [];
    for (var i = 0, childNode; (childNode = xmlElement.childNodes[i]); i++) {
      if (childNode.nodeName.toLowerCase() == 'arg') {
        this.arguments_.push(childNode.getAttribute('name'));
        this.argumentsTypes_.push(childNode.getAttribute('type') || 'Number');
      }
    }
    this.updateParams_();
  },
  getVars: function() {
    return this.arguments_;
  },
  renameVar: function(oldName, newName) {
    for (var i = 0; i < this.arguments_.length; i++) {
      if (Blockly.Names.equals(oldName, this.arguments_[i])) {
        this.arguments_[i] = newName;
      }
    }
  },
  updateParams_: function() {
    var params = '';
    if (this.arguments_.length) {
      params = ' ' + Blockly.Msg.PROCEDURES_BEFORE_PARAMS +
          ' ' + this.arguments_.join(', ');
    }
    this.setFieldValue(params, 'PARAMS');
  },
  updateShape_: function(mutatorRoot) {
        this.arguments_ = [];
        this.argumentsTypes_ = [];

        var containerBlock = null;
        if (mutatorRoot && typeof mutatorRoot.getInputTargetBlock === 'function') {
            containerBlock = mutatorRoot;
        } else if (mutatorRoot && typeof mutatorRoot.getTopBlocks === 'function') {
            var tops = mutatorRoot.getTopBlocks(true);
            for (var t = 0; t < tops.length; t++) {
                if (tops[t].type === 'procedures_mutatorcontainer') {
                    containerBlock = tops[t];
                    break;
                }
            }
            if (!containerBlock && tops.length) containerBlock = tops[0];
        }

        if (containerBlock) {
            var childBlock = containerBlock.getInputTargetBlock('STACK');
            while (childBlock) {
                this.arguments_.push(childBlock.getFieldValue('NAME'));
                this.argumentsTypes_.push(childBlock.getFieldValue('VARTYPE') || 'Number');
                childBlock = childBlock.getNextBlock();
            }
        }

        this.updateParams_();
  },
  decompose: function(workspace) {
    var containerBlock = workspace.newBlock('procedures_mutatorcontainer');
    containerBlock.initSvg();

    var connection = containerBlock.getInput('STACK').connection;
    for (var i = 0; i < this.arguments_.length; i++) {
        var paramBlock = workspace.newBlock('robProcedures_mutatorarg');
        paramBlock.initSvg();
        paramBlock.setFieldValue(this.arguments_[i], 'NAME');
        paramBlock.setFieldValue(this.argumentsTypes_[i] || 'Number', 'VARTYPE');
        paramBlock.oldLocation = i;
        connection.connect(paramBlock.previousConnection);
        connection = paramBlock.nextConnection;
    }
    if (Blockly.Procedures && Blockly.Procedures.mutateCallers) {
        Blockly.Procedures.mutateCallers(this);
    }
    return containerBlock;
  },
  compose: function(containerBlockOrWorkspace) {
    var containerBlock = containerBlockOrWorkspace;
    if (containerBlockOrWorkspace && typeof containerBlockOrWorkspace.getTopBlocks === 'function') {
        var tops = containerBlockOrWorkspace.getTopBlocks(true);
        for (var t = 0; t < tops.length; t++) {
            if (tops[t].type === 'procedures_mutatorcontainer') {
                containerBlock = tops[t];
                break;
            }
        }
        if (!containerBlock && tops.length) containerBlock = tops[0];
    }

    this.arguments_ = [];
    this.argumentsTypes_ = [];
    var paramBlock = containerBlock && containerBlock.getInputTargetBlock && containerBlock.getInputTargetBlock('STACK');
    while (paramBlock) {
        this.arguments_.push(paramBlock.getFieldValue('NAME'));
        this.argumentsTypes_.push(paramBlock.getFieldValue('VARTYPE') || 'Number');
        paramBlock = paramBlock.nextConnection && paramBlock.nextConnection.targetBlock();
    }
    this.updateParams_();
    if (Blockly.Procedures && Blockly.Procedures.mutateCallers) {
        Blockly.Procedures.mutateCallers(this);
    }
  },
  saveConnections: function(containerBlockOrWorkspace) {
    var containerBlock = containerBlockOrWorkspace;
    if (containerBlockOrWorkspace && typeof containerBlockOrWorkspace.getTopBlocks === 'function') {
        var tops = containerBlockOrWorkspace.getTopBlocks(true);
        for (var t = 0; t < tops.length; t++) {
            if (tops[t].type === 'procedures_mutatorcontainer') {
                containerBlock = tops[t];
                break;
            }
        }
        if (!containerBlock && tops.length) containerBlock = tops[0];
    }

    var paramBlock = containerBlock && containerBlock.getInputTargetBlock && containerBlock.getInputTargetBlock('STACK');
    var i = 0;
    while (paramBlock) {
        var input = this.getInput && this.getInput('ARG' + i);
        if (input) {
            try {
                paramBlock.valueConnection_ = input && input.connection && input.connection.targetConnection;
            } catch (e) {
                paramBlock.valueConnection_ = null;
            }
        }
        i++;
        paramBlock = paramBlock.nextConnection && paramBlock.nextConnection.targetBlock();
    }
  }
};

/**
 * Custom procedure call block
 */
Blockly.Blocks['customProcedures_callnoreturn'] = {
  init: function() {
    this.appendDummyInput('TOPROW')
        .appendField(new Blockly.FieldTextInput(''), 'NAME');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(Blockly.CAT_PROCEDURE_RGB);
    this.setHelpUrl(Blockly.Msg.PROCEDURES_CALLNORETURN_HELPURL);
    this.arguments_ = [];
    this.argumentTypes_ = [];
  },
  getProcedureCall: function() {
    return this.getFieldValue('NAME');
  },
  renameProcedure: function(oldName, newName) {
    if (Blockly.Names.equals(oldName, this.getProcedureCall())) {
      this.setFieldValue(newName, 'NAME');
    }
  },
  mutationToDom: function() {
    var container = document.createElement('mutation');
    container.setAttribute('name', this.getProcedureCall());
    for (var i = 0; i < this.arguments_.length; i++) {
      var parameter = document.createElement('arg');
      parameter.setAttribute('name', this.arguments_[i]);
      container.appendChild(parameter);
    }
    return container;
  },
  domToMutation: function(xmlElement) {
    var name = xmlElement.getAttribute('name');
    this.setFieldValue(name, 'NAME');
    this.arguments_ = [];
    for (var i = 0, childNode; (childNode = xmlElement.childNodes[i]); i++) {
      if (childNode.nodeName.toLowerCase() == 'arg') {
        this.arguments_.push(childNode.getAttribute('name'));
      }
    }
    this.updateShape_();
  },
  updateShape_: function() {
    for (var i = 0; i < this.arguments_.length; i++) {
      var field = this.getField('ARG' + i);
      if (field) {
        field.dispose();
      }
    }
    for (var i = 0; i < this.arguments_.length; i++) {
      var field = this.appendValueInput('ARG' + i)
          .appendField(this.arguments_[i])
          .setAlign(Blockly.ALIGN_RIGHT);
      field.init();
    }
    if (this.rendered) {
      this.render();
    }
  },
  getVars: function() {
    return this.arguments_;
  }
};

/**
 * Extract all literal parameter occurrences from a block group
 */
function extractLiteralParameters(group) {
  const params = [];
  let counter = 1;

  function addParamOccurrence(type, originalValue) {
    const name = 'param' + counter++;
    params.push({ paramName: name, type: type, originalValue: originalValue, used: false });
    return name;
  }

  function traverseBlock(b) {
    if (!b) return;

    // Extract field values from print blocks (text_print, etc.)
    if (b.type === 'text_print') {
      b.inputList.forEach(input => {
        input.fieldRow.forEach(field => {
          if (field.name && typeof field.getValue === 'function') {
            const v = field.getValue();
            if (v !== undefined && v !== null && v !== '') {
              addParamOccurrence('String', v);
            }
          }
        });
      });
    }

    b.inputList.forEach(input => {
      if (input.connection) {
        const child = input.connection.targetBlock && input.connection.targetBlock();
        if (child) {
          try {
            if (child.type === 'math_number') {
              const v = child.getFieldValue && child.getFieldValue('NUM');
              if (v !== undefined && v !== null) addParamOccurrence('Number', v);
            } else if (child.type === 'text') {
              const v = child.getFieldValue && child.getFieldValue('TEXT');
              if (v !== undefined && v !== null) addParamOccurrence('String', v);
            } else if (child.type === 'logic_boolean') {
              const v = child.getFieldValue && child.getFieldValue('BOOL');
              if (v !== undefined && v !== null) addParamOccurrence('Boolean', v);
            } else {
              // Recursively traverse all child blocks
              traverseBlock(child);
              // Also traverse next blocks in the chain
              let nextBlock = child.getNextBlock();
              while (nextBlock) {
                traverseBlock(nextBlock);
                nextBlock = nextBlock.getNextBlock();
              }
            }
          } catch (e) {}
        }
      }
    });
  }

  group.forEach(rootBlock => {
    traverseBlock(rootBlock);
  });

  return params;
}

/**
 * Create a custom function from a selected block sequence
 */
function createCustomBlockFromSequence(groups) {
  const primaryGroup = groups[0];
  const signature = getSequenceSignature(primaryGroup);

  if (customFunctionRegistry[signature]) {
    const name = customFunctionRegistry[signature];
    groups.forEach(group => {
      insertProcedureCall(group, name);
    });
    return;
  }

  const functionName = "doSomething" + (Object.keys(customFunctionRegistry).length + 1);
  customFunctionRegistry[signature] = functionName;

  Blockly.Events.disable();
  Blockly.Events.setGroup(true);

  try {
    const def = workspace.newBlock("procedures_defnoreturn");
    def.initSvg();
    def.render();
    
    const literalParams = extractLiteralParameters(primaryGroup);

    if (literalParams.length > 0) {
      const mutation = document.createElement("mutation");
      literalParams.forEach(p => {
        const arg = document.createElement("arg");
        arg.setAttribute("name", p.paramName);
        arg.setAttribute("type", p.type);
        mutation.appendChild(arg);
      });
      def.domToMutation(mutation);

      literalParams.forEach(p => {
        try { workspace.createVariable(p.paramName, p.type); } catch (e) {}
      });
    }

    let nameField = null;
    def.inputList.forEach(input => {
      input.fieldRow.forEach(field => {
        if (field.name === 'NAME' && typeof field.setValue === "function") {
          nameField = field;
        }
      });
    });

    if (nameField) {
      nameField.setValue(functionName);
      // Trigger the rename handler to register the procedure
      if (typeof nameField.onFinishEditing_ === 'function') {
        nameField.onFinishEditing_(functionName);
      }
      // Also notify Blockly's procedure system to update caller blocks
      if (Blockly.Procedures && Blockly.Procedures.mutateCallers) {
        Blockly.Procedures.mutateCallers(def);
      }
      
      // Add a change listener to update toolbox when name changes
      const originalSetValue = nameField.setValue.bind(nameField);
      nameField.setValue = function(newValue) {
        const oldValue = this.getValue();
        originalSetValue(newValue);
        
        // If the name actually changed, update the toolbox
        if (oldValue !== newValue) {
          setTimeout(() => {
            updateToolboxForProcedureRename(oldValue, newValue);
          }, 100);
        }
      };
    }

    const doInput = def.getInput("STACK").connection;

    let firstClone = null;
    let prevClone = null;

    for (let block of primaryGroup) {
      const cloned = cloneRobertaBlock(block, workspace, primaryGroup);

      if (!firstClone) {
        firstClone = cloned;
        if (cloned.previousConnection) {
          doInput.connect(cloned.previousConnection);
        }
      } else {
        if (prevClone.nextConnection && cloned.previousConnection) {
          prevClone.nextConnection.connect(cloned.previousConnection);
        }
      }

      prevClone = cloned;
    }

    if (literalParams.length > 0 && firstClone) {
      function findNextParamFor(type, value) {
        for (let p of literalParams) {
          if (!p.used && p.type === type && String(p.originalValue) === String(value)) {
            p.used = true;
            return p.paramName;
          }
        }
        return null;
      }

      // Helper function to recursively replace literals in all nested blocks
      function replaceBlockLiterals(block) {
        if (!block) return;

        // Special handling for print blocks: replace field values with variable getters
        if (block.type === 'text_print') {
          block.inputList.forEach(input => {
            input.fieldRow.forEach(field => {
              if (field && typeof field.getValue === 'function' && field.EDITABLE && field.name) {
                const v = field.getValue();
                if (v !== undefined && v !== null && v !== '') {
                  const pname = findNextParamFor('String', v);
                  if (pname) {
                    const varGetter = workspace.newBlock('variables_get');
                    try { varGetter.setFieldValue(pname, 'VAR'); } catch (e) {}
                    varGetter.initSvg(); varGetter.render();
                    
                    const inputName = input.name;
                    const inputConn = block.getInput(inputName)?.connection;
                    if (inputConn && varGetter.outputConnection) {
                      try { inputConn.connect(varGetter.outputConnection); } catch (e) {}
                    }
                  }
                }
              }
            });
          });
        }

        block.inputList.forEach(input => {
          const connected = input.connection && input.connection.targetBlock && input.connection.targetBlock();
          if (connected) {
            try {
              if (connected.type === 'math_number') {
                const v = connected.getFieldValue && connected.getFieldValue('NUM');
                const pname = findNextParamFor('Number', v);
                if (pname) {
                  try { connected.dispose(false, true); } catch (e) {}
                  const varGetter = workspace.newBlock('variables_get');
                  try { varGetter.setFieldValue(pname, 'VAR'); } catch (e) {}
                  varGetter.initSvg(); varGetter.render();
                  try { if (input.connection && varGetter.outputConnection) input.connection.connect(varGetter.outputConnection); } catch (e) {}
                }
              } else if (connected.type === 'text') {
                const v = connected.getFieldValue && connected.getFieldValue('TEXT');
                const pname = findNextParamFor('String', v);
                if (pname) {
                  try { connected.dispose(false, true); } catch (e) {}
                  const varGetter = workspace.newBlock('variables_get');
                  try { varGetter.setFieldValue(pname, 'VAR'); } catch (e) {}
                  varGetter.initSvg(); varGetter.render();
                  try { if (input.connection && varGetter.outputConnection) input.connection.connect(varGetter.outputConnection); } catch (e) {}
                }
              } else if (connected.type === 'logic_boolean') {
                const v = connected.getFieldValue && connected.getFieldValue('BOOL');
                const pname = findNextParamFor('Boolean', v);
                if (pname) {
                  try { connected.dispose(false, true); } catch (e) {}
                  const varGetter = workspace.newBlock('variables_get');
                  try { varGetter.setFieldValue(pname, 'VAR'); } catch (e) {}
                  varGetter.initSvg(); varGetter.render();
                  try { if (input.connection && varGetter.outputConnection) input.connection.connect(varGetter.outputConnection); } catch (e) {}
                }
              } else {
                // Recursively process non-literal child blocks
                replaceBlockLiterals(connected);
              }
            } catch (e) {}
          }

          const targetBlock = connected || block;
          if (targetBlock && targetBlock.inputList) {
            targetBlock.inputList.forEach(chInput => {
              chInput.fieldRow.forEach(field => {
                if (field && typeof field.getValue === 'function' && field.EDITABLE) {
                  const v = field.getValue();
                  if (v === undefined || v === null) return;
                  const ttype = (!isNaN(Number(v))) ? 'Number' : 'String';
                  const pname = findNextParamFor(ttype, v);
                  if (pname) {
                    try {
                      if (input.connection && input.connection.targetBlock()) {
                        try { input.connection.targetBlock().dispose(false, true); } catch (e) {}
                        const varGetter = workspace.newBlock('variables_get');
                        try { varGetter.setFieldValue(pname, 'VAR'); } catch (e) {}
                        varGetter.initSvg(); varGetter.render();
                        try { if (input.connection && varGetter.outputConnection) input.connection.connect(varGetter.outputConnection); } catch (e) {}
                      } else {
                        const varGetter = workspace.newBlock('variables_get');
                        try { varGetter.setFieldValue(pname, 'VAR'); } catch (e) {}
                        varGetter.initSvg(); varGetter.render();
                        try { if (input.connection && varGetter.outputConnection) input.connection.connect(varGetter.outputConnection); } catch (e) {}
                      }
                    } catch (e) {}
                  }
                }
              });
            });
          }
        });

        // Also process any blocks in the next chain
        const nextBlock = block.getNextBlock();
        if (nextBlock) {
          replaceBlockLiterals(nextBlock);
        }
      }

      // Start replacing literals in the cloned sequence
      if (firstClone) {
        replaceBlockLiterals(firstClone);
      }
    }

    groups.forEach(group => {
      insertProcedureCall(group, functionName);
    });

    // Update toolbox to show the new function
    updateToolboxForProcedure(functionName);

  } finally {
    Blockly.Events.setGroup(false);
    Blockly.Events.enable();
  }
}

function safeDispose(block) {
  if (!block) return;
  if (!block.workspace) return;
  if (!block.id) return;

  try {
    Blockly.Events.disable();
    block.dispose(false, true);
  } finally {
    Blockly.Events.enable();
  }
}

function getSequenceSignature(group) {
  return group
    .map(block => {
      return block.type + ":" + JSON.stringify(serializeBlockMinimal(block));
    })
    .join("|");
}

function showToastPrompt(message, onConfirm, onCancel) {
  const toast = document.createElement("div");
  toast.className = "toast-prompt";
  toast.innerHTML = `
    <div class="toast-message">${message}</div>
    <div class="toast-buttons">
      <button class="toast-cancel">No</button>
      <button class="toast-ok">Yes</button>
    </div>
  `;
  document.body.appendChild(toast);

  toast.querySelector(".toast-ok").onclick = () => { toast.remove(); onConfirm(); };
  toast.querySelector(".toast-cancel").onclick = () => { toast.remove(); onCancel(); };
}

function cloneRobertaBlock(block, workspace, deep = true) {
  if (!block) return null;

  const clone = workspace.newBlock(block.type);

  block.inputList.forEach(input => {
    input.fieldRow.forEach(field => {
      if (field.name && typeof field.getValue === "function") {
        try {
          clone.setFieldValue(field.getValue(), field.name);
        } catch (e) {}
      }
    });
  });

  if (deep) {
    block.inputList.forEach(input => {
      const origConn = input.connection;
      if (!origConn) return;

      const child = origConn.targetBlock();
      if (!child) return;

      const targetConn = clone.getInput(input.name)?.connection;
      if (!targetConn) return;

      if (targetConn.type === Blockly.INPUT_VALUE) {
        const clonedChild = safeCloneBlock(child, workspace);
        wipeConnections(clonedChild);
        if (clonedChild?.outputConnection) {
          targetConn.connect(clonedChild.outputConnection);
        }
        return;
      }

      if (targetConn.type === Blockly.NEXT_STATEMENT ||
          targetConn.type === Blockly.PREVIOUS_STATEMENT) {

        const chain = [];
        let c = child;
        while (c) {
          chain.push(c);
          c = c.getNextBlock();
        }

        let firstClone = null;
        let prevClone = null;
        for (let b of chain) {
          const cloned = safeCloneBlock(b, workspace);
          wipeConnections(cloned);

          if (!firstClone) {
            firstClone = cloned;
            if (firstClone.previousConnection) {
              targetConn.connect(firstClone.previousConnection);
            }
          } else if (prevClone.nextConnection && cloned.previousConnection) {
            prevClone.nextConnection.connect(cloned.previousConnection);
          }
          prevClone = cloned;
        }
      }
    });
  }

  clone.initSvg();
  clone.render();
  return clone;
}

function safeCloneBlock(block, workspace) {
  if (!block) return null;

  const cloneTop = cloneRobertaBlock(block, workspace, true);
  wipeConnections(cloneTop);

  const chain = [];
  let cursor = block.getNextBlock();
  while (cursor) {
    chain.push(cursor);
    cursor = cursor.getNextBlock();
  }

  let prevClone = cloneTop;
  for (let i = chain.length - 1; i >= 0; i--) {
    const orig = chain[i];
    const cloned = cloneRobertaBlock(orig, workspace, true);
    wipeConnections(cloned);

    if (prevClone.nextConnection && cloned.previousConnection) {
      prevClone.nextConnection.connect(cloned.previousConnection);
    }

    prevClone = cloned;
  }

  return cloneTop;
}

function updateToolboxForProcedure(procName) {
  if (!workspace || !workspace.toolbox_) return;
  
  try {
    // Get the toolbox XML element
    const toolboxXml = document.getElementById('toolbox');
    if (!toolboxXml) return;
    
    // Find the Functions category
    let functionsCategory = null;
    const categories = toolboxXml.querySelectorAll(':scope > category');
    
    for (let cat of categories) {
      const nameAttr = cat.getAttribute('name');
      if (nameAttr && nameAttr.toLowerCase() === 'functions') {
        functionsCategory = cat;
        break;
      }
    }
    
    if (!functionsCategory) return;
    
    // Check if this procedure call block already exists
    const existingBlocks = functionsCategory.querySelectorAll('block[type="procedures_callnoreturn"]');
    let blockExists = false;
    for (let block of existingBlocks) {
      const mutation = block.querySelector('mutation');
      if (mutation && mutation.getAttribute('name') === procName) {
        blockExists = true;
        break;
      }
    }
    
    // If not, add it
    if (!blockExists) {
      const callBlockXml = document.createElement('block');
      callBlockXml.setAttribute('type', 'procedures_callnoreturn');
      const mutation = document.createElement('mutation');
      mutation.setAttribute('name', procName);
      callBlockXml.appendChild(mutation);
      functionsCategory.appendChild(callBlockXml);
    }
    
    // Now rebuild the toolbox tree to include the new block
    // This is the critical step - we need to rebuild the entire toolbox
    if (workspace.toolbox_) {
      // Save current state
      const oldToolbox = workspace.toolbox_;
      
      // Clear and recreate the toolbox
      workspace.updateToolbox(toolboxXml);
    }
    
  } catch (e) {
    console.warn('Could not update toolbox:', e);
  }
}

function updateToolboxForProcedureRename(oldName, newName) {
  if (!workspace || !workspace.toolbox_) return;
  
  try {
    // Get the toolbox XML element
    const toolboxXml = document.getElementById('toolbox');
    if (!toolboxXml) return;
    
    // Find the Functions category
    let functionsCategory = null;
    const categories = toolboxXml.querySelectorAll(':scope > category');
    
    for (let cat of categories) {
      const nameAttr = cat.getAttribute('name');
      if (nameAttr && nameAttr.toLowerCase() === 'functions') {
        functionsCategory = cat;
        break;
      }
    }
    
    if (!functionsCategory) return;
    
    // Find the call block with the old name and update it
    const existingBlocks = functionsCategory.querySelectorAll('block[type="procedures_callnoreturn"]');
    for (let block of existingBlocks) {
      const mutation = block.querySelector('mutation');
      if (mutation && mutation.getAttribute('name') === oldName) {
        // Update the mutation to the new name
        mutation.setAttribute('name', newName);
        break;
      }
    }
    
    // Rebuild the toolbox to reflect the name change
    if (workspace.toolbox_) {
      workspace.updateToolbox(toolboxXml);
    }
    
  } catch (e) {
    console.warn('Could not update toolbox on rename:', e);
  }
}

function insertProcedureCall(group, name) {
  const call = workspace.newBlock("procedures_callnoreturn");
  call.setFieldValue(name, "NAME");

  const literalParams = extractLiteralParameters(group);

  if (literalParams.length > 0) {
    const mutation = document.createElement("mutation");
    literalParams.forEach(p => {
      const arg = document.createElement("arg");
      arg.setAttribute("name", p.paramName);
      arg.setAttribute("type", p.type);
      mutation.appendChild(arg);
    });
    call.domToMutation(mutation);
  }

  call.initSvg();
  call.render();

  if (literalParams.length > 0) {
    for (let i = 0; i < literalParams.length; i++) {
      const p = literalParams[i];
      const input = call.getInput('ARG' + i);
      if (!input) continue;

      let litBlock = null;
      if (p.type === 'Number') {
        litBlock = workspace.newBlock('math_number');
        try { litBlock.setFieldValue(String(p.originalValue), 'NUM'); } catch (e) {}
      } else if (p.type === 'String') {
        litBlock = workspace.newBlock('text');
        try { litBlock.setFieldValue(String(p.originalValue), 'TEXT'); } catch (e) {}
      } else {
        litBlock = workspace.newBlock('text');
        try { litBlock.setFieldValue(String(p.originalValue), 'TEXT'); } catch (e) {}
      }

      if (litBlock) {
        litBlock.initSvg();
        litBlock.render();
        try {
          if (input.connection && litBlock.outputConnection) {
            input.connection.connect(litBlock.outputConnection);
          }
        } catch (e) {}
      }
    }
  }

  const first = group[0];
  const last = group[group.length - 1];

  const parent = first.previousConnection?.targetBlock();
  const next = last.nextConnection?.targetBlock();

  if (parent?.nextConnection) {
    parent.nextConnection.connect(call.previousConnection);
  }

  if (next) {
    call.nextConnection.connect(next.previousConnection);
  }

  group.forEach(b => safeDispose(b));

  // Update the toolbox to show the new procedure
  updateToolboxForProcedure(name);
}

function wipeConnections(block) {
  if (!block) return;

  if (block.previousConnection && block.previousConnection.targetConnection) {
    try { block.previousConnection.disconnect(); } catch (e) {}
  }
  if (block.nextConnection && block.nextConnection.targetConnection) {
    try { block.nextConnection.disconnect(); } catch (e) {}
  }

  block.inputList.forEach(input => {
    const child = input.connection?.targetBlock();
    if (child) wipeConnections(child);
  });
}

function serializeBlockMinimal(block) {
  const json = {
    type: block.type,
    fields: {},
  };

  block.inputList.forEach(input => {
    input.fieldRow.forEach(field => {
      if (field.name && typeof field.getValue === "function") {
        json.fields[field.name] = field.getValue();
      }
    });
  });

  return json;
}

// ============================================================================
// VISUAL HIGHLIGHTING AND DESIGN
// ============================================================================

function applyBorderGlow(block) {
  if (block.__borderInterval) return;

  let path = block.svgPath_;
  if (!path) return;

  if (!block.__origStroke) {
    block.__origStroke = path.getAttribute("stroke") || "#000000";
    block.__origStrokeWidth = path.getAttribute("stroke-width") || 2;
  }

  let fromColor = "#000000";
  let toColor = "#000000";
  let pulse = 0;
  let direction = 1;

  block.__borderInterval = setInterval(() => {
    pulse += direction * 0.05;

    if (pulse >= 1) direction = -1;
    if (pulse <= 0) direction = 1;

    let strokeColor = mixColors(fromColor, toColor, pulse);

    path.setAttribute("stroke", strokeColor);
    path.setAttribute("stroke-width", 4);

  }, 50);
}

function removeBorderGlow(block) {
  if (block.__borderInterval) {
    clearInterval(block.__borderInterval);
    block.__borderInterval = null;
  }

  const root = block.getSvgRoot();
  if (!root) return;

  const paths = root.querySelectorAll("path");

  paths.forEach(path => {
    if (block.__origStroke != null) {
      path.setAttribute("stroke", block.__origStroke);
    } else {
      path.removeAttribute("stroke");
    }

    if (block.__origStrokeWidth != null) {
      path.setAttribute("stroke-width", block.__origStrokeWidth);
    } else {
      path.removeAttribute("stroke-width");
    }

    if (block.__origStrokeOp != null) {
      path.setAttribute("stroke-opacity", block.__origStrokeOp);
    } else {
      path.removeAttribute("stroke-opacity");
    }
  });

  delete block.__origStroke;
  delete block.__origStrokeWidth;
  delete block.__origStrokeOp;
}

function mixColors(color1, color2, amount) {
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    let b = parseInt(hex, 16);
    return {
      r: (b >> 16) & 255,
      g: (b >> 8) & 255,
      b: b & 255
    };
  }

  amount = Math.max(0, Math.min(1, amount));

  let c1 = hexToRgb(color1);
  let c2 = hexToRgb(color2);

  return `rgb(${
    Math.round(c1.r + (c2.r - c1.r) * amount)
  },${
    Math.round(c1.g + (c2.g - c1.g) * amount)
  },${
    Math.round(c1.b + (c2.b - c1.b) * amount)
  })`;
}

// ============================================================================
// BLOCK STRUCTURE ANALYSIS AND SEQUENCE DETECTION
// ============================================================================

function blockIsStructurallyComplete(block) {
  if (!block) return false;

  switch (block.type) {
    case "controls_if":
    case "robControls_if": {
      let cond = block.getInputTargetBlock("IF0");
      let doBlock = block.getInputTargetBlock("DO0");
      return !!cond && !!doBlock;
    }

    case "controls_repeat_ext":
    case "robControls_repeat":
    case "controls_repeat": {
      let times = block.getInputTargetBlock("TIMES") ||
                  block.getField("TIMES");
      let inner = block.getInputTargetBlock("DO");
      return !!times && !!inner;
    }

    case "text_print":
    case "robActions_print":
      return !!block.getInputTargetBlock("TEXT") ||
             !!block.getField("TEXT");

    default:
      return true;
  }
}

function serializeBlockTree(block) {
  if (!block || !blockIsStructurallyComplete(block)) {
    return null;
  }

  let obj = {
    type: block.type,
    fields: {},
    inputs: {}
  };

  block.inputList.forEach(input => {
    input.fieldRow.forEach(field => {
      if (field.name) {
        obj.fields[field.name] = "__IGNORED__";
      }
    });
  });

  block.inputList.forEach(input => {
    let conn = input.connection;

    if (conn && conn.targetBlock()) {
      let child = conn.targetBlock();
      let children = [];

      while (child) {
        if (blockIsStructurallyComplete(child)) {
          children.push(serializeBlockTree(child));
        }
        child = child.getNextBlock();
      }

      obj.inputs[input.name] = children;
    }
  });

  return obj;
}

function structureKey(block) {
  return JSON.stringify(serializeBlockTree(block));
}

function getLinearChainFromStart(startBlock) {
  let chain = [];
  let b = startBlock.getNextBlock();

  while (b) {
    chain.push(b);
    b = b.getNextBlock();
  }

  return chain;
}

function hasAtLeastThreeDifferentTypes(group) {
  return new Set(group.map(b => b.type)).size >= 3;
}

function highlightBlockAndChildren(block) {
  applyBorderGlow(block);

  block.inputList.forEach(input => {
    let conn = input.connection;

    if (conn && conn.targetBlock()) {
      let child = conn.targetBlock();

      while (child) {
        highlightBlockAndChildren(child);
        child = child.getNextBlock();
      }
    }
  });
}

function highlightOnlyFunctionCandidates(workspace, startBlock, SEQ_LEN = 3) {
  toastPromptShown = false;
  workspace.getAllBlocks().forEach(b => {
    removeBorderGlow(b)
  });
  
  const chain = getLinearChainFromStart(startBlock);
  if (chain.length < SEQ_LEN) return;

  let sequences = {};

  for (let i = 0; i <= chain.length - SEQ_LEN; i++) {
    let group = chain.slice(i, i + SEQ_LEN);

    if (!group.every(blockIsStructurallyComplete)) continue;
    if (!hasAtLeastThreeDifferentTypes(group)) continue;

    let key = group.map(b => structureKey(b)).join("|SEQ|");

    if (!sequences[key]) sequences[key] = [];
    sequences[key].push(group);
  }

  let allDuplicateGroups = [];

  Object.values(sequences).forEach(groups => {
    if (groups.length >= 2) {
      allDuplicateGroups.push(...groups);
    }
  });

  if (allDuplicateGroups.length > 0) {
    allDuplicateGroups.forEach(group => {
      group.forEach(b => highlightBlockAndChildren(b));
    });
    
    if (!toastPromptShown) {
      toastPromptShown = true;
      setTimeout(() => {
        showToastPrompt(
            "Identical block sequence detected. Replace with a custom block?",
            () => createCustomBlockFromSequence(allDuplicateGroups),
            () => console.log("User declined replacement.")
        );
      }, 5000);
    }
    
  }
}
