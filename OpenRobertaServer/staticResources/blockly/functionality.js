;(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.openRobertaFunctionality = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

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
  // Forward to the enhanced implementation if available (defined later in file).
  if (typeof showToastPromptImpl === 'function') {
    try { return showToastPromptImpl(message, onConfirm, onCancel); } catch (e) { console.error('showToastPromptImpl error', e); }
  }

  // Fallback simple prompt (used only if the enhanced impl isn't yet defined)
  const toast = document.createElement("div");
  toast.className = "toast-prompt";
  toast.style.position = 'fixed';
  toast.style.right = '20px';
  toast.style.bottom = '20px';
  toast.style.zIndex = 20000;
  toast.style.background = 'rgba(0,0,0,0.85)';
  toast.style.color = '#fff';
  toast.style.padding = '12px 14px';
  toast.style.borderRadius = '6px';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
  toast.style.fontFamily = 'Arial, sans-serif';
  toast.innerHTML = `
    <div class="toast-message">${message}</div>
    <div class="toast-buttons">
      <button class="toast-cancel">No</button>
      <button class="toast-ok">Yes</button>
    </div>
  `;
  document.body.appendChild(toast);

  toast.querySelector(".toast-ok").onclick = () => { try { toast.remove(); onConfirm(); } catch(e) { console.error(e); } };
  toast.querySelector(".toast-cancel").onclick = () => { try { toast.remove(); onCancel(); } catch(e) { console.error(e); } };
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

// 

function insertProcedureCall(group, name,workspace) {
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
function createCustomBlockFromSequence(groups,workspace) {
  console.log('createCustomBlockFromSequence: invoked, groups length=', groups ? groups.length : 0);
  // Ensure we have a workspace reference. Older code assumed a global `workspace` variable.
  

  const primaryGroup = groups[0];
  const signature = getSequenceSignature(primaryGroup);

  if (customFunctionRegistry[signature]) {
    const name = customFunctionRegistry[signature];
    groups.forEach(group => {
      insertProcedureCall(group, name,workspace);
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
            updateToolboxForProcedureRename(oldValue, newValue,workspace);
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
      insertProcedureCall(group, functionName,workspace);
    });

    // visual feedback for debugging: flash first block of the primary group
    try {
      if (primaryGroup && primaryGroup[0]) {
        applyBorderGlow(primaryGroup[0]);
        setTimeout(() => removeBorderGlow(primaryGroup[0]), 1200);
      }
    } catch (e) { console.warn('flash feedback failed', e); }

    // Update toolbox to show the new function
    updateToolboxForProcedure(functionName,workspace);

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

function showToastPromptImpl(message, onConfirm, onCancel) {
  const toast = document.createElement("div");
  toast.className = "toast-prompt";
  // ensure it's visible regardless of existing CSS
  toast.style.position = 'fixed';
  toast.style.right = '20px';
  toast.style.bottom = '20px';
  toast.style.zIndex = 20000;
  toast.style.background = '#222';
  toast.style.color = '#fff';
  toast.style.padding = '14px 20px';
  toast.style.borderRadius = '10px';
  toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
  toast.style.fontFamily = 'Arial, sans-serif';
  toast.style.maxWidth = '320px';
  toast.style.animation = 'fadeIn .3s ease';
  toast.innerHTML = `
    <div class="toast-message" style="margin-bottom:8px">${message}</div>
    <div class="toast-buttons" style="margin-top: 10px;
  text-align: right;">
      <button class="toast-cancel" style="background: #777; margin-left: 10px;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  cursor: pointer;">No</button>
      <button class="toast-ok" style="background: #4CAF50; color: white; margin-left: 10px;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  cursor: pointer;">Yes</button>
    </div>
  `;
  console.log('showToastPrompt: creating toast');
  document.body.appendChild(toast);

  const okBtn = toast.querySelector(".toast-ok");
  const cancelBtn = toast.querySelector(".toast-cancel");

  if (okBtn) {
    okBtn.addEventListener('click', function() {
      try {
        console.log('showToastPrompt: OK clicked');
        toast.remove();
      } catch (e) {}
      try { onConfirm(); } catch (err) { console.error('onConfirm failed', err); }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      try {
        console.log('showToastPrompt: Cancel clicked');
        toast.remove();
      } catch (e) {}
      try { onCancel(); } catch (err) { console.error('onCancel failed', err); }
    });
  }
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

function updateToolboxForProcedure(procName, workspace) {
  // No-op: Blockly's Functions category is dynamic and generates caller blocks
  // from procedure definitions found in the workspace. Manipulating the
  // toolbox DOM here can break Blockly's flyout (getDescendants errors).
  console.log('updateToolboxForProcedure: noop (procName=', procName, ')');
  return;
}

function updateToolboxForProcedureRename(oldName, newName,workspace) {
  // No-op: don't manipulate the toolbox DOM directly (Blockly handles procedure caller generation).
  console.log('updateToolboxForProcedureRename: noop (oldName=', oldName, 'newName=', newName, ')');
  return;
}

// ============================================================================
// VISUAL HIGHLIGHTING AND DESIGN
// ============================================================================

function applyBorderGlow(block) {
  if (block.__borderInterval) return;

  let path = block.svgPath_;
  if (!path) return;

  if (!block.__origStroke) {
    // sanitize stroke color: Blockly may not accept 8-digit hex (#RRGGBBAA)
    var s = path.getAttribute("stroke") || "#000000";
    try {
      if (typeof s === 'string' && /^#([0-9a-fA-F]{8})$/.test(s)) {
        // drop alpha channel
        s = '#' + s.substr(1, 6);
      }
    } catch (e) {}
    block.__origStroke = s;
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
      // sanitize before applying: remove alpha if present
      var orig = block.__origStroke;
      try {
        if (typeof orig === 'string' && /^#([0-9a-fA-F]{8})$/.test(orig)) {
          orig = '#' + orig.substr(1,6);
        }
      } catch (e) {}
      path.setAttribute("stroke", orig);
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
  console.log("Highlighting function candidates...");
  toastPromptShown = false;
  workspace.getAllBlocks().forEach(b => {
    removeBorderGlow(b)
  });
  
  // If no startBlock provided, try to pick the best candidate from the workspace
  if (!startBlock) {
    try {
      const tops = (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];

      // Prefer the top block that yields the longest linear chain
      let best = null;
      let bestLen = -1;
      for (let t of tops) {
        try {
          const ch = getLinearChainFromStart(t) || [];
          if (ch.length > bestLen) {
            bestLen = ch.length;
            best = t;
          }
        } catch (e) {}
      }

      if (best && bestLen > 0) {
        startBlock = best;
      } else {
        // Fallback: scan all blocks to find the one with the longest next-chain
        const all = (workspace.getAllBlocks && workspace.getAllBlocks()) || [];
        best = null; bestLen = -1;
        for (let b of all) {
          try {
            const ch = getLinearChainFromStart(b) || [];
            if (ch.length > bestLen) {
              bestLen = ch.length;
              best = b;
            }
          } catch (e) {}
        }
        startBlock = (bestLen > 0 && best) ? best : (tops[0] || all[0] || null);
      }

      console.log('highlightOnlyFunctionCandidates: chosen startBlock =', startBlock && startBlock.type);
    } catch (e) {
      console.warn('highlightOnlyFunctionCandidates: error selecting startBlock', e);
    }
  }

  try {
    var sbId = startBlock && startBlock.id;
    var topsDbg = (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
    var firstTopId = topsDbg[0] && topsDbg[0].id;
    console.log('highlightOnlyFunctionCandidates: startBlock id=', sbId, 'tops[0] id=', firstTopId, 'equal=', sbId === firstTopId);
    console.log('highlightOnlyFunctionCandidates: startBlock object === tops[0]? ', startBlock === topsDbg[0]);
    console.log('highlightOnlyFunctionCandidates: startBlock.getNextBlock exists?', !!(startBlock && startBlock.getNextBlock));
  } catch (e) {}

  const chain = getLinearChainFromStart(startBlock) || [];
  console.log('highlightOnlyFunctionCandidates: linear chain length =', chain.length);
  // If chain is empty, try a more aggressive traversal that walks top-blocks
  // and collects statement/next chains to build a usable linear sequence.
  if ((!chain || chain.length === 0) && startBlock) {
    try {
      function collectFromBlock(b, out) {
        if (!b) return;
        // For a block, collect its next-chain and also expand statement inputs in-order
        let cur = b.getNextBlock && b.getNextBlock();
        while (cur) {
          out.push(cur);
          // For each statement input on cur, collect nested chains as inline sequence
          if (cur.inputList && cur.inputList.length) {
            cur.inputList.forEach(function(inp) {
              try {
                if (inp.connection && inp.connection.targetBlock) {
                  let child = inp.connection.targetBlock();
                  while (child) {
                    out.push(child);
                    // also include child's next-chain
                    let nc = child.getNextBlock && child.getNextBlock();
                    while (nc) {
                      out.push(nc);
                      nc = nc.getNextBlock && nc.getNextBlock();
                    }
                    child = child.getNextBlock && child.getNextBlock();
                  }
                }
              } catch (e) {}
            });
          }
          cur = cur.getNextBlock && cur.getNextBlock();
        }
      }

      var alt = [];
      // Try collecting starting from the top block (startBlock may be a top)
      collectFromBlock(startBlock, alt);

      // If still empty, scan subsequent top blocks and collect their chains
      if (alt.length === 0) {
        var tops = (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
        var startIndex = tops.indexOf(startBlock);
        if (startIndex < 0) startIndex = 0;
        for (var ti = startIndex; ti < tops.length; ti++) {
          collectFromBlock(tops[ti], alt);
        }
      }

      if (alt.length > 0) {
        console.log('highlightOnlyFunctionCandidates: using alternative chain length =', alt.length);
        chain.length = 0;
        Array.prototype.push.apply(chain, alt);
      }
    } catch (e) {
      console.warn('highlightOnlyFunctionCandidates: alternative chain build failed', e);
    }
  }
  if (chain.length === 0) {
    try {
      const tops = (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
      console.warn('Repetition diagnostic: top blocks count =', tops.length);
      tops.slice(0, 10).forEach(function(b, i) {
        try { console.warn(' top[' + i + '] type=', b && b.type, 'linearChainLen=', (getLinearChainFromStart(b) || []).length); } catch (e) {}
      });

      const all = (workspace.getAllBlocks && workspace.getAllBlocks()) || [];
      console.warn('Repetition diagnostic: all blocks count =', all.length);
      all.slice(0, 30).forEach(function(b, i) {
        try {
          var hasPrev = !!(b && b.previousConnection && b.previousConnection.targetConnection);
          var hasNext = !!(b && b.getNextBlock && b.getNextBlock());
          console.warn(' all[' + i + '] type=', b && b.type, 'hasPrev=', hasPrev, 'hasNext=', hasNext);
        } catch (e) {}
      });
    } catch (e) { console.warn('Repetition diagnostic failed', e); }
  }
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
    console.log('highlightOnlyFunctionCandidates: found duplicate groups =', allDuplicateGroups.length);
    allDuplicateGroups.forEach(group => {
      group.forEach(b => highlightBlockAndChildren(b));
    });

    if (!toastPromptShown) {
      toastPromptShown = true;
      console.log('highlightOnlyFunctionCandidates: scheduling toast prompt in 5s');
      setTimeout(() => {
        console.log('highlightOnlyFunctionCandidates: invoking showToastPrompt');
        showToastPrompt(
            "Identical block sequence detected. Replace with a custom block?",
            function() {
              try {
                console.log('toast OK clicked: calling createCustomBlockFromSequence');
                createCustomBlockFromSequence(allDuplicateGroups,workspace);
              } catch (err) {
                console.error('createCustomBlockFromSequence failed', err);
              }
            },
            function() {
              try { console.log('toast Cancel clicked: user declined replacement.'); } catch (e) {}
            }
        );
      }, 5000);
    }
    
  }
}

//newmethod
//add eventlistener for newRunBrick
function initRunBrick(workspace){
  let RunBrick = document.getElementById('newRunBrick');
  if (RunBrick) {
    console.log('adding eventlistener');
    // must use anonymous function to pass parameters to newRunBrick()
    RunBrick.addEventListener("click", function(){ newRunBrick(workspace); });
  }
}

// highlightOnlyFunctionCandidates is called in main.js
// call my functions same way
async function newRunBrick(workspace){
    const apiUrl = 'http://127.0.0.1:5000'; // Flask app URL

      console.info("launching viewer!");
      //wait for viewer to be ready
      await getCall(apiUrl + '/viewer').then(_ => console.log('Have awaited launcing viewer'));

      let xmlProgram = Blockly.Xml.workspaceToDom(workspace);
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

  //map for procedure calls
  let procedureMap = new Map();
  //map for defined arguments
  let argsMap = new Map();

  function queueBlocks(blockElems){
    //gets blocks, puts in queue (array) and/or map depending on procedure or not
      let blockStack = [];
      procedureMap = new Map(); //reset global map

      for (let index = 0; index < blockElems.length; index++) {
          const element = blockElems[index];
          let type = element.getAttribute('type');
          if(type=='procedures_defnoreturn' || type=='robProcedures_defnoreturn'){ //defining custom block
              let procedureName = element.childNodes[1].childNodes[0].nodeValue;
              //stupid nested if-else, bc element.childNodes[3] only works for our block, bc extra child 'Comment'
              if(type=='procedures_defnoreturn'){ //add stack element's children as procedure
                procedureMap.set(procedureName, element.childNodes[3].childNodes);
              } else {
                procedureMap.set(procedureName, element.childNodes[2].childNodes);
              }
              //move past the blocks nested in procedure - so we dont accidentally add the procedure to the queue again
              let nestedBlocks = element.getElementsByTagName("block");
              index += nestedBlocks.length;
          } else { //all other block types
              // add as 'next' in queue
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
      let obj;
      //rn everything is just GET. Maybe POST is more correct but if it works why bother
      switch(element.getAttribute('type')){
        case 'naoActions_moveToPosition':
          //The values we want to get are nested like:
          // value, block, field, text.nodeValue (each being a xml element)
          //The x value in <field> x_value </field>, is treated as a childNode 
          let val = element.childNodes[0].childNodes[0].childNodes[0].childNodes[0].nodeValue;
          //if found value is a parameter, get the value in map. Otherwise it's a number, and we use that
          let x = argsMap.has(val) ? argsMap.get(val) : val;
          val = element.childNodes[1].childNodes[0].childNodes[0].childNodes[0].nodeValue;
          let y = argsMap.has(val) ? argsMap.get(val) : val;
          val = element.childNodes[2].childNodes[0].childNodes[0].childNodes[0].nodeValue;
          let z = argsMap.has(val) ? argsMap.get(val) : val;
          console.info("coordinates x, y and z: ", x, " ",  y, " ", z);
          url = apiUrl + '/move_pos/' + x + "/" + y + "/" + z;

          await getCall(url);
          continue;
        case 'naoActions_moveToObject':
            obj = element.childNodes[0].childNodes[0].nodeValue;
            url = apiUrl + '/move_obj/' + obj;
            await getCall(url);
            continue;
        case 'naoActions_pickObject':
            //pickObject has field <field name="OBJECT">RED_OBJECT</field>
            //to get the actual value of the field, we must access the child's child
            obj = element.childNodes[0].childNodes[0].nodeValue;
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
        case 'robProcedures_callnoreturn': //still need to handle OG define function feature
            let procedureName = element.childNodes[0].getAttribute('name');
            console.info("procedure found: ", procedureName);
            // Call the corresponding procedure in procedureMap
            if (procedureMap.has(procedureName)){
              //call function recursively, to make api calls for all blocks in procedure
              await blockAPICalls(apiUrl, procedureMap.get(procedureName));
            }
            continue;
        case 'customProcedures_callnoreturn': //NOTICE - it's _CALLnoreturn, not _DEFnoreturn 
            procedureName = element.childNodes[0].getAttribute('name');
            console.info("procedure found: ", procedureName);
            // Call the corresponding procedure in procedureMap
            if (procedureMap.has(procedureName)){
              //if called with parameters, save those in map
              let args = element.childNodes[0].childNodes;
              for (let index = 0; index < args.length; index++) {
                const arg = args[index];
                //get the actual value
                //value( child block (child field (child text)))
                let value = element.childNodes[2+index].childNodes[0].childNodes[0].childNodes[0].nodeValue;

                argsMap.set(arg.getAttribute('name'), value);
                //console.info("got args name: ", arg.getAttribute('name'));
               // console.info("got value: ", value);
              }
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

  // Exported API for CommonJS/AMD/browser global
  return {
    customFunctionRegistry: typeof customFunctionRegistry !== 'undefined' ? customFunctionRegistry : {},
    showToastPrompt: typeof showToastPrompt !== 'undefined' ? showToastPrompt : null,
    cloneRobertaBlock: typeof cloneRobertaBlock !== 'undefined' ? cloneRobertaBlock : null,
    safeCloneBlock: typeof safeCloneBlock !== 'undefined' ? safeCloneBlock : null,
    insertProcedureCall: typeof insertProcedureCall !== 'undefined' ? insertProcedureCall : null,
    wipeConnections: typeof wipeConnections !== 'undefined' ? wipeConnections : null,
    serializeBlockMinimal: typeof serializeBlockMinimal !== 'undefined' ? serializeBlockMinimal : null,
    makeBlock: typeof makeBlock !== 'undefined' ? makeBlock : null,
    buildTestCase: typeof buildTestCase !== 'undefined' ? buildTestCase : null,
    buildLargeTestCase: typeof buildLargeTestCase !== 'undefined' ? buildLargeTestCase : null,
    mixColors: typeof mixColors !== 'undefined' ? mixColors : null,
    runTest: typeof runTest !== 'undefined' ? runTest : null,
    run2ndTest: typeof run2ndTest !== 'undefined' ? run2ndTest : null,
    extractLiteralParameters: typeof extractLiteralParameters !== 'undefined' ? extractLiteralParameters : null,
    createCustomBlockFromSequence: typeof createCustomBlockFromSequence !== 'undefined' ? createCustomBlockFromSequence : null,
    safeDispose: typeof safeDispose !== 'undefined' ? safeDispose : null,
    getSequenceSignature: typeof getSequenceSignature !== 'undefined' ? getSequenceSignature : null,
    updateToolboxForProcedure: typeof updateToolboxForProcedure !== 'undefined' ? updateToolboxForProcedure : null,
    updateToolboxForProcedureRename: typeof updateToolboxForProcedureRename !== 'undefined' ? updateToolboxForProcedureRename : null,
    applyBorderGlow: typeof applyBorderGlow !== 'undefined' ? applyBorderGlow : null,
    removeBorderGlow: typeof removeBorderGlow !== 'undefined' ? removeBorderGlow : null,
    highlightOnlyFunctionCandidates: typeof highlightOnlyFunctionCandidates !== 'undefined' ? highlightOnlyFunctionCandidates : null,
    initRunBrick: typeof initRunBrick !== 'undefined' ? initRunBrick : null
  };

});
/*
function buildTestCase(ws, offsetX = 30, offsetY = 30) {

    
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
*/