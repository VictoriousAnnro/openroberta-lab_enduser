(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.openRobertaFunctionality = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Custom Procedures and Function Auto-Creator
   *
   * This module provides:

// Define a simple 'move up' block: increases the end-effector Z by a specified amount (cm)
if (typeof Blockly !== "undefined" && Blockly.Blocks && !Blockly.Blocks["naoActions_moveUp"]) {
  Blockly.Blocks["naoActions_moveUp"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("move up by (cm)")
        .appendField(new Blockly.FieldNumber(10, -1000, 1000, 1), "DZ");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(230);
      this.setTooltip("Raise the robot end-effector by the given centimeters");
    },
  };
}
// Define a block to request the result be shown on the laptop screen.
if (typeof Blockly !== "undefined" && Blockly.Blocks && !Blockly.Blocks["naoActions_getResultInLaptop"]) {
  Blockly.Blocks["naoActions_getResultInLaptop"] = {
    init: function () {
      this.appendDummyInput().appendField("get result in laptop");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(230);
      this.setTooltip("Show 'SUCCESS' or 'FAIL' on the laptop screen depending on analysis result");
    },
  };
}
   * - Block definitions: robProcedures_mutatorarg, robProcedures_mutatorcontainer,
   *   customProcedures_defnoreturn, customProcedures_callnoreturn
   * - Auto-creation of functions from repeated block sequences
   * - Literal parameter extraction and replacement
   * - Mutator UI for adding/removing typed parameters
   * - Visual highlighting and sequence detection
   */

  var customFunctionRegistry = {};
  var structuralFunctionRegistry = {};
  var promptedSignatures = new Set();
  var rejectedSignatures = new Set();

  const usedNames = new Set();
  let globalParamCounter = 0;
  const SVG_NS = "http://www.w3.org/2000/svg";
  let definitionToggleAttached = false;

  function getDefinitionWorkspaceWrapper() {
    if (typeof document === "undefined") {
      return null;
    }
    return document.getElementById("definitionWorkspaceContainer");
  }

  function scheduleWorkspaceResize() {
    if (
      typeof window === "undefined" ||
      !window.Blockly ||
      typeof window.Blockly.svgResize !== "function"
    ) {
      return;
    }
    requestAnimationFrame(function () {
      try {
        if (window.OR_MAIN_WORKSPACE) {
          window.Blockly.svgResize(window.OR_MAIN_WORKSPACE);
        }
        if (window.OR_DEF_WORKSPACE) {
          window.Blockly.svgResize(window.OR_DEF_WORKSPACE);
        }
      } catch (e) {}
    });
  }

  function updateDefinitionWorkspaceToggleUI(isExpanded) {
    if (typeof document === "undefined") {
      return;
    }
    var toggle = document.getElementById("definitionWorkspaceToggle");
    if (!toggle) {
      return;
    }
    var expandedLabel =
      toggle.getAttribute("data-expanded-label") || "Hide functions";
    var collapsedLabel =
      toggle.getAttribute("data-collapsed-label") || "Show functions";
    toggle.textContent = isExpanded ? expandedLabel : collapsedLabel;
    toggle.setAttribute("aria-expanded", String(!!isExpanded));
  }

  function collapseDefinitionWorkspacePane() {
    if (typeof document === "undefined") {
      return;
    }

    var wrapper = getDefinitionWorkspaceWrapper();
    if (!wrapper) {
      return;
    }

    if (wrapper.dataset.state === "collapsed") {
      updateDefinitionWorkspaceToggleUI(false);
      return;
    }

    wrapper.dataset.state = "collapsed";
    wrapper.style.pointerEvents = "none";
    wrapper.style.width = "0";
    wrapper.style.minWidth = "0";
    wrapper.style.boxShadow = "none";
    wrapper.style.borderLeft = "";
    wrapper.style.bottom = "0";
    wrapper.style.height = "0";
    wrapper.setAttribute("aria-hidden", "true");

    var host = document.getElementById("workspaceHost");
    if (host) {
      if (
        Object.prototype.hasOwnProperty.call(
          host.dataset,
          "originalPaddingRight"
        )
      ) {
        host.style.paddingRight = host.dataset.originalPaddingRight;
      } else {
        host.style.paddingRight = "";
      }
    }

    var blocklyDiv = document.getElementById("blocklyDiv");
    if (blocklyDiv) {
      if (
        Object.prototype.hasOwnProperty.call(
          blocklyDiv.dataset,
          "originalMarginRight"
        )
      ) {
        blocklyDiv.style.marginRight = blocklyDiv.dataset.originalMarginRight;
      } else {
        blocklyDiv.style.marginRight = "";
      }
    }

    updateDefinitionWorkspaceToggleUI(false);
    scheduleWorkspaceResize();
  }

  function setupDefinitionWorkspaceToggleButton() {
    if (definitionToggleAttached || typeof document === "undefined") {
      return;
    }
    var toggle = document.getElementById("definitionWorkspaceToggle");
    if (!toggle) {
      return;
    }
    definitionToggleAttached = true;
    toggle.addEventListener("click", function (evt) {
      try {
        evt.preventDefault();
      } catch (e) {}
      var wrapper = getDefinitionWorkspaceWrapper();
      var shouldExpand = !wrapper || wrapper.dataset.state === "collapsed";
      if (shouldExpand) {
        revealDefinitionWorkspacePane();
      } else {
        collapseDefinitionWorkspacePane();
      }
    });

    var wrapper = getDefinitionWorkspaceWrapper();
    var isExpanded =
      wrapper && wrapper.dataset && wrapper.dataset.state === "expanded";
    if (!isExpanded && wrapper) {
      wrapper.dataset.state = "collapsed";
      wrapper.setAttribute("aria-hidden", "true");
    }
    updateDefinitionWorkspaceToggleUI(!!isExpanded);
  }

  function showToastPrompt(message, onConfirm, onCancel) {
    // Forward to the enhanced implementation if available (defined later in file).
    if (typeof showToastPromptImpl === "function") {
      try {
        return showToastPromptImpl(message, onConfirm, onCancel);
      } catch (e) {
        console.error("showToastPromptImpl error", e);
      }
    }

    // Fallback simple prompt (used only if the enhanced impl isn't yet defined)
    const toast = document.createElement("div");
    toast.className = "toast-prompt";
    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.zIndex = 20000;
    toast.style.background = "rgba(0,0,0,0.85)";
    toast.style.color = "#fff";
    toast.style.padding = "12px 14px";
    toast.style.borderRadius = "6px";
    toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.5)";
    toast.style.fontFamily = "Arial, sans-serif";
    toast.innerHTML = `
    <div class="toast-message">${message}</div>
    <div class="toast-buttons">
      <button class="toast-cancel">No</button>
      <button class="toast-ok">Yes</button>
    </div>
  `;
    document.body.appendChild(toast);

    toast.querySelector(".toast-ok").onclick = () => {
      try {
        toast.remove();
        onConfirm();
      } catch (e) {
        console.error(e);
      }
    };
    toast.querySelector(".toast-cancel").onclick = () => {
      try {
        toast.remove();
        onCancel();
      } catch (e) {
        console.error(e);
      }
    };
  }

  function cloneRobertaBlock(block, workspace, deep = true) {
    if (!block) return null;

    // Create block of same type
    const clone = workspace.newBlock(block.type);

    // Copy fields
    block.inputList.forEach((input) => {
      input.fieldRow.forEach((field) => {
        if (field.name && typeof field.getValue === "function") {
          try {
            const param = literalParams.find((p) => p.fieldName === field.name);
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
      block.inputList.forEach((input) => {
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
        if (
          targetConn.type === Blockly.NEXT_STATEMENT ||
          targetConn.type === Blockly.PREVIOUS_STATEMENT
        ) {
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

  function insertProcedureCall(group, name, workspace, canonicalParams) {
    console.log("insertProcedureCall: Native XML Mode for " + name);

    // 1. Extract parameters to determine required inputs
    let literalParams = extractLiteralParameters(group, workspace);
    literalParams = applyCanonicalParamNames(literalParams, canonicalParams);

    // 2. Build XML for the Native Call Block
    // This guarantees the block initializes with the correct argument slots immediately.
    let xmlString = '<block type="robProcedures_callnoreturn">';

    // The Mutation tag defines the arguments
    xmlString += `<mutation name="${name}">`;
    if (literalParams.length > 0) {
      literalParams.forEach((p) => {
        // Capitalize type to match Definition: "Number", "Boolean", "String"
        let type =
          p.type.charAt(0).toUpperCase() + p.type.slice(1).toLowerCase();
        xmlString += `<arg name="${p.paramName}" type="${type}"></arg>`;
      });
    }
    xmlString += "</mutation>";

    // Set the visual name
    xmlString += `<field name="NAME">${name}</field>`;
    xmlString += "</block>";

    // 3. Create the Block from XML
    const parser = new DOMParser();
    const xmlDom = parser.parseFromString(
      xmlString,
      "text/xml"
    ).documentElement;
    const call = Blockly.Xml.domToBlock(xmlDom, workspace);

    call.initSvg();
    call.render();

    // 4. Plug in the Parameter Values
    // We created slots ARG0, ARG1... now we fill them with shadow blocks (values)
    if (literalParams.length > 0) {
      for (let i = 0; i < literalParams.length; i++) {
        const p = literalParams[i];
        const input = call.getInput("ARG" + i);

        if (input) {
          // Create a value block based on the parameter kind/type
          let valBlock = null;

          if (p.kind === "dropdown") {
            valBlock = createDropdownValueBlock(workspace, p);
          } else if (p.type === "Number") {
            valBlock = workspace.newBlock("math_number");
            try {
              valBlock.setFieldValue(String(p.originalValue), "NUM");
            } catch (e) {}
          } else if (p.type === "String") {
            valBlock = workspace.newBlock("text");
            try {
              valBlock.setFieldValue(String(p.originalValue), "TEXT");
            } catch (e) {}
          } else if (p.type === "Boolean") {
            valBlock = workspace.newBlock("logic_boolean");
            try {
              let boolVal = String(p.originalValue).toUpperCase();
              if (boolVal !== "TRUE" && boolVal !== "FALSE") boolVal = "TRUE";
              valBlock.setFieldValue(boolVal, "BOOL");
            } catch (e) {}
          }

          // Connect the value block
          if (valBlock) {
            if (typeof valBlock.setShadow === "function") {
              try {
                valBlock.setShadow(true);
              } catch (e) {}
            }
            valBlock.initSvg();
            valBlock.render();
            if (valBlock.outputConnection) {
              input.connection.connect(valBlock.outputConnection);
            }
          }
        }
      }
    }

    // 5. Insert the Call Block into the sequence flow
    const first = group[0];
    const last = group[group.length - 1];

    const parent = first.previousConnection?.targetBlock();
    const next = last.nextConnection?.targetBlock();

    // Connect to Top (Parent)
    if (parent) {
      // 1. Check if we are connected to a Next connection (Flow)
      if (
        parent.nextConnection &&
        first.previousConnection &&
        parent.nextConnection.targetConnection === first.previousConnection
      ) {
        parent.nextConnection.connect(call.previousConnection);
      }
      // 2. Check if we are inside a Statement Input (e.g., Inside an IF loop)
      else {
        const parentInput = first.previousConnection.targetConnection;
        if (parentInput) {
          parentInput.connect(call.previousConnection);
        }
      }
    }

    // Connect to Bottom (Next Block)
    if (next) {
      call.nextConnection.connect(next.previousConnection);
    }

    // 6. Dispose of the old blocks (The ones we just replaced)
    group.forEach((b) => safeDispose(b));
  }
  // Remove any accidental auto-connections so Blockly doesn't reorder things.
  function wipeConnections(block) {
    if (!block) return;

    if (block.previousConnection && block.previousConnection.targetConnection) {
      try {
        block.previousConnection.disconnect();
      } catch (e) {}
    }
    if (block.nextConnection && block.nextConnection.targetConnection) {
      try {
        block.nextConnection.disconnect();
      } catch (e) {}
    }

    block.inputList.forEach((input) => {
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
    block.inputList.forEach((input) => {
      input.fieldRow.forEach((field) => {
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
    Object.keys(fields).forEach((name) => {
      try {
        block.setFieldValue(fields[name], name);
      } catch (e) {}
    });

    // Create + connect children blocks
    Object.keys(children).forEach((inputName) => {
      const childSpec = children[inputName];
      const childBlock = makeBlock(
        childSpec.type,
        workspace,
        childSpec.fields,
        childSpec.children
      );

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
        b: b & 255,
      };
    }

    amount = Math.max(0, Math.min(1, amount));

    let c1 = hexToRgb(color1);
    let c2 = hexToRgb(color2);

    return `rgb(${Math.round(
      c1.r + (c2.r - c1.r) * amount
    )},${Math.round(c1.g + (c2.g - c1.g) * amount)},${Math.round(c1.b + (c2.b - c1.b) * amount)})`;
  }

  // Utility to purge plain objects that track detection state.
  function clearObjectStore(store) {
    if (!store) {
      return;
    }
    Object.keys(store).forEach((key) => delete store[key]);
  }

  function runTest() {
    //highlightOnlyFunctionCandidates(workspace, blocks[0]); // start block

    console.log("Test done");
  }
  function run2ndTest() {
    buildTestCase(workspace);

    //highlightOnlyFunctionCandidates(workspace, blocks[0]); // start block

    console.log("Test done");
  }

  function getDropdownOptions(field) {
    if (!field) {
      return [];
    }

    let options = [];
    if (typeof field.getOptions === "function") {
      try {
        options = field.getOptions();
      } catch (e) {
        options = [];
      }
    } else if (Array.isArray(field.menuGenerator_)) {
      options = field.menuGenerator_.slice();
    } else if (typeof field.menuGenerator_ === "function") {
      try {
        options = field.menuGenerator_.call(field);
      } catch (e) {
        options = [];
      }
    }

    if (!Array.isArray(options)) {
      return [];
    }

    return options
      .map((opt) => {
        if (!Array.isArray(opt) || opt.length < 2) {
          return null;
        }
        const label = opt[0] != null ? String(opt[0]) : "";
        const value = opt[1] != null ? String(opt[1]) : "";
        return [label, value];
      })
      .filter(Boolean);
  }

  function isParameterizableDropdownField(field) {
    if (!field) {
      return false;
    }

    if (typeof Blockly !== "undefined") {
      if (
        typeof Blockly.FieldVariable !== "undefined" &&
        field instanceof Blockly.FieldVariable
      ) {
        return false;
      }
    }

    if (typeof field.getValue !== "function") {
      return false;
    }

    const options = getDropdownOptions(field);
    if (!options.length) {
      return false;
    }

    return options.every((opt) => typeof opt[1] === "string");
  }

  const DROPDOWN_PARAM_BLOCK_TYPE = "or_parameter_dropdown_value";

  function ensureDropdownValueBlockDefinition() {
    if (typeof Blockly === "undefined" || !Blockly.Blocks) {
      return false;
    }
    if (Blockly.Blocks[DROPDOWN_PARAM_BLOCK_TYPE]) {
      return true;
    }

    Blockly.Blocks[DROPDOWN_PARAM_BLOCK_TYPE] = {
      init: function () {
        this.dropdownOptions_ = [["", ""]];
        const field = new Blockly.FieldDropdown(() =>
          this.getDropdownOptions_()
        );
        this.appendDummyInput().appendField(field, "CHOICE");
        this.setOutput(true, "String");
        this.setColour(210);
        this.setTooltip("Select one of the recorded options.");
      },
      getDropdownOptions_: function () {
        if (
          !Array.isArray(this.dropdownOptions_) ||
          !this.dropdownOptions_.length
        ) {
          this.dropdownOptions_ = [["", ""]];
        }
        return this.dropdownOptions_;
      },
      mutationToDom: function () {
        const container = document.createElement("mutation");
        try {
          container.setAttribute(
            "options",
            JSON.stringify(this.dropdownOptions_ || [])
          );
        } catch (e) {
          container.setAttribute("options", "[]");
        }
        container.setAttribute("value", this.getFieldValue("CHOICE") || "");
        return container;
      },
      domToMutation: function (xmlElement) {
        const optsAttr = xmlElement.getAttribute("options");
        if (optsAttr) {
          try {
            this.dropdownOptions_ = JSON.parse(optsAttr);
          } catch (e) {
            this.dropdownOptions_ = [["", ""]];
          }
        }
        const field = this.getField("CHOICE");
        if (field) {
          field.menuGenerator_ = () => this.getDropdownOptions_();
          const storedValue = xmlElement.getAttribute("value");
          const fallback =
            storedValue ||
            (this.dropdownOptions_[0] ? this.dropdownOptions_[0][1] : "");
          if (fallback) {
            try {
              field.setValue(fallback);
            } catch (e) {}
          }
        }
      },
    };

    return true;
  }

  function configureDropdownValueBlock(block, param) {
    if (!block || !param) {
      return;
    }
    let options = Array.isArray(param.dropdownOptions)
      ? param.dropdownOptions
      : [];
    if (!options.length) {
      const fallbackValue =
        param.originalValue != null && String(param.originalValue).length
          ? String(param.originalValue)
          : param.paramName || "option";
      options = [[fallbackValue, fallbackValue]];
    } else {
      options = options.map((opt) => {
        if (!Array.isArray(opt) || opt.length < 2) {
          return ["", ""];
        }
        return [
          opt[0] != null ? String(opt[0]) : String(opt[1] || ""),
          opt[1] != null ? String(opt[1]) : "",
        ];
      });
    }

    // Deduplicate by value while preserving first labels
    const seen = new Set();
    const deduped = [];
    options.forEach((opt) => {
      if (!opt[1]) {
        return;
      }
      if (seen.has(opt[1])) {
        return;
      }
      seen.add(opt[1]);
      deduped.push(opt);
    });
    block.dropdownOptions_ = deduped.length ? deduped : [["", ""]];

    const field = block.getField("CHOICE");
    if (field) {
      field.menuGenerator_ = () => block.getDropdownOptions_();
      const defaultValue = deduped.find(
        (opt) => opt[1] === String(param.originalValue)
      )?.[1];
      const fallback =
        defaultValue ||
        (block.dropdownOptions_[0] ? block.dropdownOptions_[0][1] : "");
      try {
        field.setValue(fallback || "");
      } catch (e) {}
    }
  }

  function createDropdownValueBlock(workspace, param) {
    if (!workspace || !ensureDropdownValueBlockDefinition()) {
      return null;
    }
    const block = workspace.newBlock(DROPDOWN_PARAM_BLOCK_TYPE);
    configureDropdownValueBlock(block, param);
    return block;
  }

  /**
   * Extract all literal parameter occurrences from a block group
   */

  function extractLiteralParameters(group, workspace) {
    console.log("Extracting literal parameters from group:", group);
    const params = [];

    // Reset per-run state so each extracted function starts with a fresh local counter
    usedNames.clear();

    if (workspace) {
      // A. Check standard global variables
      if (workspace.getAllVariables) {
        workspace.getAllVariables().forEach((v) => usedNames.add(v.name));
      }

      // B. Scan existing function definitions for THEIR parameters
      if (workspace.getBlocksByType) {
        const procedures = workspace.getBlocksByType(
          "robProcedures_defnoreturn"
        );
        procedures.forEach((p) => {
          if (p.getProcedureDef) {
            const def = p.getProcedureDef();
            if (def[1] && Array.isArray(def[1])) {
              def[1].forEach((paramName) => usedNames.add(paramName));
            }
          }
        });
      }
    }

    // 2. Naming Strategy: Strictly x, x2, x3, x4...
    // We remove the alphabetical array to ensure consistency with the definition block.
    let paramCounter = 0;
    const dropdownNameCounters = {};

    function addParamOccurrence(type, originalValue, extraMeta = {}) {
      globalParamCounter++;
      paramCounter++;

      // Generate candidate name: x, x2, x3, x4...
      let candidateName =
        globalParamCounter === 1
          ? "parameter 1"
          : "parameter " + globalParamCounter;

      if (extraMeta.kind === "dropdown") {
        const dropdownIndex =
          (dropdownNameCounters[extraMeta.fieldName || "global"] || 0) + 1;
        dropdownNameCounters[extraMeta.fieldName || "global"] = dropdownIndex;
        candidateName = `${DROPDOWN_PARAM_NAME_PREFIX} ${dropdownIndex}`;
      }

      // 3. Collision Resolution
      // If 'x' or 'x2' is already a global variable, skip it and keep incrementing
      // until we find a free name. This ensures we don't get a mismatch.
      while (usedNames.has(candidateName)) {
        globalParamCounter++;
        candidateName = "parameter " + globalParamCounter;
      }

      // Reserve this name so the next parameter in *this* function doesn't use it
      usedNames.add(candidateName);

      const param = {
        paramName: candidateName,
        type: type,
        originalValue: originalValue,
        used: false,
        ...extraMeta,
      };
      params.push(param);
      return param;
    }

    // Standard traversal
    function traverseBlock(b) {
      if (!b) return;

      b.inputList.forEach((input) => {
        if (Array.isArray(input.fieldRow)) {
          input.fieldRow.forEach((field) => {
            if (!isParameterizableDropdownField(field)) {
              return;
            }

            let value = null;
            try {
              value = field.getValue();
            } catch (e) {}

            if (typeof value !== "string" || value.length === 0) {
              return;
            }

            const dropdownParam = addParamOccurrence("String", value, {
              kind: "dropdown",
              fieldName: field.name || null,
              fieldSourceType: b.type || null,
              dropdownLabel:
                (typeof field.getText === "function" && field.getText()) ||
                value,
            });
            dropdownParam.dropdownOptions = getDropdownOptions(field);
          });
        }

        if (input.connection) {
          const child =
            input.connection.targetBlock && input.connection.targetBlock();
          if (child) {
            // Special naming for naoActions_moveToPosition coordinates
            if (b && b.type === "naoActions_moveToPosition") {
              if (
                child.type === "math_number" ||
                child.type === "math_integer"
              ) {
                const v = child.getFieldValue("NUM");
                if (v != null) {
                  let customName = null;
                  if (input.name === "X") {
                    customName = "coordinate X";
                  } else if (input.name === "Y") {
                    customName = "coordinate Y";
                  } else if (input.name === "Z") {
                    customName = "coordinate Z";
                  }

                  if (customName) {
                    params.push({
                      paramName: customName,
                      type: "Number",
                      originalValue: v,
                      used: false,
                      kind: "literal",
                    });
                    usedNames.add(customName);
                    return;
                  }
                }
              }
            }

            // Default literal handling
            if (child.type === "math_number" || child.type === "math_integer") {
              const v = child.getFieldValue("NUM");
              if (v != null)
                addParamOccurrence("Number", v, { kind: "literal" });
            } else if (child.type === "text") {
              const v = child.getFieldValue("TEXT");
              if (v != null)
                addParamOccurrence("String", v, { kind: "literal" });
            } else if (child.type === "logic_boolean") {
              const v = child.getFieldValue("BOOL");
              if (v != null)
                addParamOccurrence("Boolean", v, { kind: "literal" });
            } else {
              traverseBlock(child);
              let nextBlock = child.getNextBlock();
              while (nextBlock) {
                traverseBlock(nextBlock);
                nextBlock = nextBlock.getNextBlock();
              }
            }
          }
        }
      });
    }

    group.forEach((rootBlock) => traverseBlock(rootBlock));
    return params;
  }

  function resolveDefinitionWorkspace(sourceWorkspace) {
    if (typeof Blockly === "undefined") {
      return sourceWorkspace;
    }

    try {
      if (typeof Blockly.getDefinitionWorkspace === "function") {
        var existing = Blockly.getDefinitionWorkspace();
        if (existing) {
          return existing;
        }
      }
    } catch (e) {
      console.warn(
        "resolveDefinitionWorkspace: error querying definition workspace",
        e
      );
    }

    if (typeof window !== "undefined" && window.OR_DEF_WORKSPACE) {
      return window.OR_DEF_WORKSPACE;
    }

    if (!sourceWorkspace || !sourceWorkspace.options) {
      return sourceWorkspace;
    }

    var host = document.getElementById("definitionWorkspace");
    if (!host) {
      return sourceWorkspace;
    }

    try {
      var baseOptions = sourceWorkspace.options;
      var defToolbox = baseOptions.toolbox;
      if (
        defToolbox &&
        typeof defToolbox === "object" &&
        typeof defToolbox.cloneNode === "function"
      ) {
        var cloned = defToolbox.cloneNode(true);
        if (!cloned.id && defToolbox.id) {
          cloned.id = defToolbox.id + "-definition";
        } else if (!cloned.id) {
          cloned.id = "definition-toolbox";
        }
        cloned.style.display = "none";
        host.appendChild(cloned);
        defToolbox = cloned;
      } else if (defToolbox && typeof defToolbox === "object") {
        defToolbox = JSON.parse(JSON.stringify(defToolbox));
      }

      var injected = Blockly.inject(host, {
        toolbox: defToolbox,
        horizontalLayout: baseOptions.horizontalLayout,
        grid: baseOptions.grid,
        renderer: baseOptions.renderer,
        theme: baseOptions.theme,
        collapse: baseOptions.collapse,
        comments: baseOptions.comments,
        disable: baseOptions.disable,
        media: baseOptions.media,
        sounds: baseOptions.sounds,
        oneBasedIndex: baseOptions.oneBasedIndex,
        rtl: baseOptions.RTL,
      });

      if (typeof window !== "undefined") {
        window.OR_DEF_WORKSPACE = injected;
      }
      if (typeof Blockly.getDefinitionWorkspace !== "function") {
        Blockly.getDefinitionWorkspace = function () {
          return injected;
        };
      }

      return injected;
    } catch (e) {
      console.warn(
        "resolveDefinitionWorkspace: failed to inject fallback workspace",
        e
      );
      return sourceWorkspace;
    }
  }

  function revealDefinitionWorkspacePane() {
    if (typeof document === "undefined") {
      return;
    }

    var wrapper = document.getElementById("definitionWorkspaceContainer");
    if (!wrapper) {
      return;
    }

    var expandedWidthAttr = parseInt(
      wrapper.getAttribute("data-expanded-width"),
      10
    );
    var widthPx = !isNaN(expandedWidthAttr) ? expandedWidthAttr : 600;
    var bottomClearAttr = parseInt(
      wrapper.getAttribute("data-clear-bottom"),
      10
    );
    var bottomClearPx = !isNaN(bottomClearAttr) ? bottomClearAttr : 80;
    var widthValue = widthPx + "px";
    var bottomValue = bottomClearPx + "px";

    wrapper.style.display = "block";
    wrapper.style.width = widthValue;
    wrapper.style.minWidth = widthValue;
    wrapper.style.bottom = bottomValue;
    wrapper.style.zIndex = "2000";
    wrapper.style.pointerEvents = "auto";
    wrapper.style.overflow = "hidden";
    if (!wrapper.style.backgroundColor) {
      wrapper.style.backgroundColor = "rgba(15,23,42,0.95)";
    }
    if (!wrapper.style.borderLeft) {
      wrapper.style.borderLeft = "1px solid rgba(148,163,184,0.4)";
    }
    if (!wrapper.style.boxShadow) {
      wrapper.style.boxShadow = "-10px 0 24px rgba(15,23,42,0.5)";
    }
    wrapper.setAttribute("aria-hidden", "false");
    wrapper.dataset.state = "expanded";

    if (!wrapper.dataset.originalHeight) {
      wrapper.dataset.originalHeight = wrapper.style.height || "";
    }
    wrapper.style.height = "calc(100% - " + bottomValue + ")";

    var host = document.getElementById("workspaceHost");
    if (host) {
      if (!host.dataset.originalPaddingRight) {
        host.dataset.originalPaddingRight = host.style.paddingRight || "";
      }
      host.style.paddingRight = widthValue;
    }

    var blocklyDiv = document.getElementById("blocklyDiv");
    if (blocklyDiv) {
      if (!blocklyDiv.dataset.originalMarginRight) {
        blocklyDiv.dataset.originalMarginRight =
          blocklyDiv.style.marginRight || "";
      }
      blocklyDiv.style.marginRight = widthValue;
    }

    updateDefinitionWorkspaceToggleUI(true);
    scheduleWorkspaceResize();
  }

  /**
   * Create a custom function from a selected block sequence
   */
  function createCustomBlockFromSequence(groups, workspace) {
    console.log("createCustomBlockFromSequence: Native DOM Trigger Mode");

    const primaryGroup = groups[0];
    const signature = getSequenceSignature(primaryGroup);
    const structuralSignature = getStructuralSequenceSignature(primaryGroup);

    const sourceWorkspace =
      workspace ||
      (typeof Blockly !== "undefined"
        ? typeof Blockly.getMainWorkspace === "function"
          ? Blockly.getMainWorkspace()
          : Blockly.mainWorkspace || null
        : null);
    if (!sourceWorkspace) {
      console.warn(
        "createCustomBlockFromSequence: no source workspace; aborting"
      );
      return;
    }

    if (customFunctionRegistry[signature]) {
      const existingEntry = customFunctionRegistry[signature];
      const existingName =
        typeof existingEntry === "string" ? existingEntry : existingEntry.name;
      const existingParams =
        typeof existingEntry === "string" ? [] : existingEntry.params || [];
      if (existingName && !structuralFunctionRegistry[structuralSignature]) {
        structuralFunctionRegistry[structuralSignature] = {
          name: existingName,
          params: cloneParamDefinitions(existingParams),
        };
      }
      groups.forEach((group) => {
        insertProcedureCall(
          group,
          existingName,
          sourceWorkspace,
          existingParams
        );
      });
      return;
    }

    const functionName =
      "ReusableComponent" + (Object.keys(customFunctionRegistry).length + 1);

    Blockly.Events.disable();
    Blockly.Events.setGroup(true);

    try {
      // 1. Extract Parameters
      // OLD: const literalParams = extractLiteralParameters(group);
      // NEW:
      const literalParams = extractLiteralParameters(
        primaryGroup,
        sourceWorkspace
      );
      const canonicalParams = cloneParamDefinitions(literalParams);
      customFunctionRegistry[signature] = {
        name: functionName,
        params: canonicalParams,
      };
      structuralFunctionRegistry[structuralSignature] = {
        name: functionName,
        params: cloneParamDefinitions(canonicalParams),
      };

      // 2. Create the Original Native Block in the target workspace.
      // Prefer a dedicated definition workspace if one is exposed globally
      // (e.g. a secondary Blockly.inject on the same page). Fallback to
      // the workspace where the sequence was detected.
      const targetWs =
        resolveDefinitionWorkspace(sourceWorkspace) || sourceWorkspace;
      if (!targetWs) {
        console.warn(
          "createCustomBlockFromSequence: no target workspace available"
        );
        return;
      }

      const usingDedicatedWorkspace = targetWs !== sourceWorkspace;
      if (usingDedicatedWorkspace) {
        revealDefinitionWorkspacePane();
      }

      // Ensure the parameter variables already exist in the destination
      // workspace before domToMutation() runs, otherwise Open Roberta will
      // refuse to draw the declaration rows for those arguments.
      seedDefinitionVariables(targetWs, literalParams);
      if (usingDedicatedWorkspace) {
        seedDefinitionVariables(sourceWorkspace, literalParams);
      }

      // We do NOT use XML creation here, we use newBlock to get the standard init().
      const def = targetWs.newBlock("robProcedures_defnoreturn");
      def.initSvg();
      def.render();
      for (let i = 0; i < literalParams.length; i++) {
        def.updateShape_(1);
      }

      // 4. Set the Name
      let nameField = def.getField("NAME");
      if (nameField) {
        var oldValidator = nameField.validator_;
        nameField.validator_ = null;
        nameField.setValue(functionName);
        nameField.validator_ = oldValidator;
      }

      // 5. CALL THE INTERNAL FUNCTION (The "Magic")
      if (literalParams.length > 0) {
        // Construct the XML element that represents the parameters
        const mutationElement = document.createElement("mutation");
        mutationElement.setAttribute("declare", "false");

        literalParams.forEach((p) => {
          const arg = document.createElement("arg");
          arg.setAttribute("name", p.paramName);
          // OpenRoberta expects capitalized types: "Number", "Boolean"
          let type =
            p.type.charAt(0).toUpperCase() + p.type.slice(1).toLowerCase();
          arg.setAttribute("type", type);
          mutationElement.appendChild(arg);
        });

        // Call the function defined inside the block!
        // This forces the block to process the args and draw the rows.
        def.domToMutation(mutationElement);

        // Ensure the declaration blocks reflect the detected names and types.
        syncParameterDeclarations(def, literalParams, targetWs);
      }

      refreshProcedureCallers(def);

      // 6. Fill the Stack
      const doInput = def.getInput("STACK");
      if (doInput) {
        const connection = doInput.connection;
        let firstClone = null;
        let prevClone = null;

        for (let block of primaryGroup) {
          const cloned = cloneRobertaBlock(block, targetWs, primaryGroup);
          if (!firstClone) {
            firstClone = cloned;
            if (cloned.previousConnection)
              connection.connect(cloned.previousConnection);
          } else {
            if (prevClone.nextConnection && cloned.previousConnection) {
              prevClone.nextConnection.connect(cloned.previousConnection);
            }
          }
          prevClone = cloned;
        }

        if (literalParams.length > 0 && firstClone) {
          // Replace literals inside the cloned body using the same
          // workspace that owns the definition (targetWs). Using the
          // original workspace here would try to connect blocks across
          // workspaces and throw "Blocks not on same workspace".
          replaceBlockLiterals(firstClone, literalParams, targetWs);
        }
      }

      if (usingDedicatedWorkspace) {
        createHiddenDefinitionMirror(def, sourceWorkspace);
      }

      // 7. Replace with Calls
      groups.forEach((group) => {
        insertProcedureCall(
          group,
          functionName,
          sourceWorkspace,
          canonicalParams
        );
      });

      // Position
      if (primaryGroup[0]) {
        const xy = primaryGroup[0].getRelativeToSurfaceXY();
        def.moveBy(xy.x + 50, xy.y + 50);
      }
      // Inform the user where to inspect the new reusable component with a
      // small, styled toast instead of a blocking browser alert.
      try {
        var note = document.createElement("div");
        note.className = "or-toast or-toast-info";
        note.style.position = "fixed";
        note.style.right = "20px";
        note.style.bottom = "20px";
        note.style.zIndex = 20000;
        note.style.background = "#1f2933";
        note.style.color = "#f9fafb";
        note.style.padding = "10px 14px";
        note.style.borderRadius = "8px";
        note.style.boxShadow = "0 4px 18px rgba(0,0,0,0.35)";
        note.style.fontFamily = "Arial, sans-serif";
        note.style.fontSize = "13px";
        note.style.maxWidth = "280px";
        note.style.display = "flex";
        note.style.alignItems = "flex-start";

        var icon = document.createElement("span");
        icon.textContent = "?";
        icon.style.display = "inline-flex";
        icon.style.alignItems = "center";
        icon.style.justifyContent = "center";
        icon.style.width = "20px";
        icon.style.height = "20px";
        icon.style.marginRight = "8px";
        icon.style.borderRadius = "50%";
        icon.style.background = "#3b82f6";
        icon.style.color = "#fff";
        icon.style.fontWeight = "bold";
        icon.style.flexShrink = "0";

        var text = document.createElement("div");
        text.textContent =
          "You can now see your created reusable component block in the above workspace that has dark background!";

        var closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.style.marginLeft = "10px";
        closeBtn.style.border = "none";
        closeBtn.style.background = "transparent";
        closeBtn.style.color = "#9ca3af";
        closeBtn.style.cursor = "pointer";
        closeBtn.style.fontSize = "14px";
        closeBtn.onclick = function () {
          try {
            note.remove();
          } catch (e) {}
        };

        note.appendChild(icon);
        note.appendChild(text);
        note.appendChild(closeBtn);

        document.body.appendChild(note);

        setTimeout(function () {
          try {
            note.remove();
          } catch (e) {}
        }, 6000);
      } catch (e) {}
    } catch (e) {
      console.error("Error creating custom block:", e);
    } finally {
      Blockly.Events.setGroup(false);
      Blockly.Events.enable();
    }
  }

  // Helper to replace values with variables (Ensure this exists in your file)
  // Helper to replace values with variables (1-to-1 mapping)
  function normalizeParameterType(type) {
    if (!type || typeof type !== "string") {
      return undefined;
    }
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  }

  function getOrCreateVariableModel(workspace, param) {
    if (!workspace || !param || !param.paramName) {
      return null;
    }

    const normalizedType = normalizeParameterType(param.type);
    let model = null;

    if (typeof workspace.getVariable === "function") {
      model =
        workspace.getVariable(param.paramName, normalizedType) ||
        workspace.getVariable(param.paramName);
    }

    if (!model && typeof workspace.createVariable === "function") {
      try {
        model = workspace.createVariable(param.paramName, normalizedType);
      } catch (e) {
        console.warn("Failed to create parameter variable", param.paramName, e);
      }
    }

    return model;
  }

  function seedDefinitionVariables(workspace, literalParams) {
    if (!workspace || !Array.isArray(literalParams) || !literalParams.length) {
      return;
    }

    literalParams.forEach((param) => {
      if (!param || !param.paramName) {
        return;
      }
      const model = getOrCreateVariableModel(workspace, param);
      if (model && typeof model.getId === "function") {
        param.variableId = model.getId();
      } else if (!param.variableId) {
        param.variableId = param.paramName;
      }
    });
  }

  function parkHiddenDefinitionBlock(block, workspace, orderIndex) {
    if (!block || !workspace) {
      return;
    }

    var index =
      typeof orderIndex === "number" && orderIndex >= 0 ? orderIndex : 0;
    var targetX = 32;
    var targetY = 32 + index * 24;

    try {
      var current = block.getRelativeToSurfaceXY
        ? block.getRelativeToSurfaceXY()
        : null;
      if (current) {
        block.moveBy(targetX - current.x, targetY - current.y);
      }
    } catch (e) {}
  }

  function createHiddenDefinitionMirror(defBlock, sourceWorkspace) {
    if (
      !defBlock ||
      !sourceWorkspace ||
      defBlock.workspace === sourceWorkspace ||
      typeof Blockly === "undefined" ||
      !Blockly.Xml ||
      typeof Blockly.Xml.blockToDom !== "function" ||
      typeof Blockly.Xml.domToBlock !== "function"
    ) {
      return;
    }

    try {
      var nameField = defBlock.getField && defBlock.getField("NAME");
      var signature = nameField ? nameField.getValue() : defBlock.id;
      var registryKey = "hidden::" + signature;

      if (!sourceWorkspace.__orHiddenDefinitions) {
        sourceWorkspace.__orHiddenDefinitions = Object.create(null);
      }
      if (sourceWorkspace.__orHiddenDefinitions[registryKey]) {
        try {
          sourceWorkspace.__orHiddenDefinitions[registryKey].dispose(false);
        } catch (e) {}
        delete sourceWorkspace.__orHiddenDefinitions[registryKey];
      }

      var hiddenOrderIndex = Object.keys(
        sourceWorkspace.__orHiddenDefinitions
      ).filter(function (key) {
        return key && key.indexOf("hidden::") === 0;
      }).length;

      const domList = [];
      var dom = Blockly.Xml.blockToDom(defBlock, domList);
      dom = domList && domList.length ? domList[0] : dom;
      if (dom && dom.setAttribute) {
        dom.removeAttribute("id");
      }
      dom.setAttribute("collapsed", "true");
      dom.setAttribute("deletable", "false");
      dom.setAttribute("movable", "false");
      dom.setAttribute("editable", "false");
      dom.setAttribute("hidden-definition", "true");

      var hiddenBlock = Blockly.Xml.domToBlock(dom, sourceWorkspace);
      hiddenBlock.setCollapsed(true);
      hiddenBlock.setDeletable(false);
      hiddenBlock.setMovable(false);
      hiddenBlock.setEditable(false);
      hiddenBlock.setWarningText(null);
      if (typeof hiddenBlock.setCommentText === "function") {
        try {
          hiddenBlock.setCommentText(null);
        } catch (e) {}
      }
      hiddenBlock.__orHiddenDefinition = true;
      parkHiddenDefinitionBlock(hiddenBlock, sourceWorkspace, hiddenOrderIndex);
      var root = hiddenBlock.getSvgRoot && hiddenBlock.getSvgRoot();
      if (root) {
        root.style.display = "none";
        root.style.pointerEvents = "none";
      }

      refreshProcedureCallers(hiddenBlock);

      sourceWorkspace.__orHiddenDefinitions[registryKey] = hiddenBlock;
    } catch (e) {
      console.warn("createHiddenDefinitionMirror failed", e);
    }
  }

  function syncParameterDeclarations(defBlock, literalParams, workspace) {
    if (
      !defBlock ||
      !Array.isArray(literalParams) ||
      literalParams.length === 0
    ) {
      return;
    }

    const declarationInput = defBlock.getInput("ST");
    if (!declarationInput || !declarationInput.connection) {
      console.warn(
        "syncParameterDeclarations: no declaration input on procedure"
      );
      return;
    }

    let declaration = declarationInput.connection.targetBlock();
    let index = 0;
    const targetWorkspace = workspace || defBlock.workspace;

    while (declaration && index < literalParams.length) {
      if (declaration.type === "robLocalVariables_declare") {
        const param = literalParams[index++];
        const normalizedType = normalizeParameterType(param.type) || "Number";

        const nameField = declaration.getField("VAR");
        if (nameField) {
          const previousValidator = nameField.validator_;
          if (typeof nameField.setValidator === "function") {
            nameField.setValidator(null);
          }
          nameField.setValue(param.paramName);
          if (typeof nameField.setValidator === "function") {
            nameField.setValidator(previousValidator || null);
          }
        }

        const typeField = declaration.getField("TYPE");
        if (typeField) {
          typeField.setValue(normalizedType);
        }
        if (typeof declaration.updateType_ === "function") {
          declaration.updateType_(normalizedType);
        }

        const model = getOrCreateVariableModel(targetWorkspace, param);
        if (model && typeof model.getId === "function") {
          param.variableId = model.getId();
        } else {
          param.variableId = param.paramName;
        }
      }

      declaration = declaration.getNextBlock
        ? declaration.getNextBlock()
        : null;
    }

    if (index < literalParams.length) {
      console.warn(
        "syncParameterDeclarations: parameter count exceeds declarations"
      );
    }
  }

  function refreshProcedureCallers(defBlock) {
    if (!defBlock || typeof Blockly === "undefined" || !Blockly.Procedures) {
      return;
    }

    try {
      if (typeof Blockly.Procedures.mutateCallers === "function") {
        Blockly.Procedures.mutateCallers(defBlock);
      } else if (typeof Blockly.Procedures.updateCallers === "function") {
        Blockly.Procedures.updateCallers(defBlock);
      }
    } catch (e) {
      console.warn("refreshProcedureCallers failed", e);
    }
  }

  function replaceBlockLiterals(block, literalParams, workspace) {
    if (!block) return;

    const literalQueue = literalParams.filter((p) => p.kind !== "dropdown");
    let nextLiteralIndex = 0;

    const dropdownQueues = new Map();
    literalParams
      .filter((p) => p.kind === "dropdown")
      .forEach((param) => {
        const key = buildDropdownKey(param.fieldSourceType, param.fieldName);
        if (!dropdownQueues.has(key)) {
          dropdownQueues.set(key, []);
        }
        dropdownQueues.get(key).push(param);
      });

    const takeNextLiteralParam = () => {
      if (nextLiteralIndex >= literalQueue.length) {
        return null;
      }
      const param = literalQueue[nextLiteralIndex++];
      param.used = true;
      return param;
    };

    const takeDropdownParamForField = (field, sourceBlock) => {
      if (!field) {
        return null;
      }
      const sourceType =
        (sourceBlock && sourceBlock.type) ||
        (field.sourceBlock_ && field.sourceBlock_.type) ||
        "";
      const key = buildDropdownKey(sourceType, field.name);
      let queue = dropdownQueues.get(key);

      if (!queue || queue.length === 0) {
        // fallback: try matching just by field name
        const fallbackKey = buildDropdownKey("", field.name);
        queue = dropdownQueues.get(fallbackKey);
      }

      if (!queue || queue.length === 0) {
        return null;
      }

      const param = queue.shift();
      param.used = true;
      return param;
    };

    const isLiteralBlock = (target) => {
      if (!target) return false;
      return (
        target.type === "math_number" ||
        target.type === "math_integer" ||
        target.type === "text" ||
        target.type === "logic_boolean"
      );
    };

    const tryReplaceDropdownField = (field, sourceBlock) => {
      if (!field) {
        return;
      }

      const candidate = takeDropdownParamForField(field, sourceBlock);
      if (!candidate) {
        return;
      }

      const label = candidate.paramName || candidate.dropdownLabel || "";
      ensureDropdownHasParameterOption(field, label, candidate.paramName);
      try {
        field.setValue(candidate.paramName);
      } catch (e) {}
    };

    const walk = (current) => {
      if (!current) return;

      current.inputList.forEach((input) => {
        if (Array.isArray(input.fieldRow)) {
          input.fieldRow.forEach((field) => {
            tryReplaceDropdownField(field, current);
          });
        }

        const target = input.connection && input.connection.targetBlock();
        if (!target) {
          return;
        }

        if (isLiteralBlock(target)) {
          const matchedParam = takeNextLiteralParam();
          if (!matchedParam) {
            return;
          }

          const varGet = workspace.newBlock("variables_get");
          let variableModel = null;
          if (
            matchedParam.variableId &&
            typeof workspace.getVariableById === "function"
          ) {
            variableModel = workspace.getVariableById(matchedParam.variableId);
          }
          if (!variableModel) {
            variableModel = getOrCreateVariableModel(workspace, matchedParam);
          }

          const fieldValue =
            variableModel && typeof variableModel.getId === "function"
              ? variableModel.getId()
              : matchedParam.paramName;
          matchedParam.variableId =
            variableModel && typeof variableModel.getId === "function"
              ? variableModel.getId()
              : matchedParam.paramName;
          varGet.setFieldValue(fieldValue, "VAR");
          varGet.initSvg();
          varGet.render();

          target.dispose();
          input.connection.connect(varGet.outputConnection);
        } else {
          walk(target);
        }
      });

      if (current.getNextBlock) {
        walk(current.getNextBlock());
      }
    };

    walk(block);
  }

  function buildDropdownKey(sourceType, fieldName) {
    return `${sourceType || "__any"}::${fieldName || "__field"}`;
  }

  function ensureDropdownHasParameterOption(field, label, value) {
    if (!field || typeof value !== "string" || !value.length) {
      return;
    }

    const normalizedLabel = label && label.length ? label : value;
    const existingOptions = getDropdownOptions(field);
    const hasOption = existingOptions.some((opt) => opt[1] === value);

    if (hasOption) {
      if (
        typeof field.menuGenerator_ === "function" &&
        Array.isArray(existingOptions)
      ) {
        field.menuGenerator_ = existingOptions.slice();
      }
      return;
    }

    if (Array.isArray(field.menuGenerator_)) {
      field.menuGenerator_.push([normalizedLabel, value]);
    } else {
      const updated = existingOptions.concat([[normalizedLabel, value]]);
      field.menuGenerator_ = updated;
    }
  }

  function cloneParamDefinitions(params) {
    if (!Array.isArray(params)) return [];
    return params.map((p) => ({
      paramName: p.paramName,
      type: p.type,
      originalValue: p.originalValue,
      variableId: p.variableId,
    }));
  }

  function applyCanonicalParamNames(actualParams, canonicalParams) {
    if (!Array.isArray(canonicalParams) || canonicalParams.length === 0) {
      return actualParams;
    }

    if (!Array.isArray(actualParams) || actualParams.length === 0) {
      console.warn(
        "applyCanonicalParamNames: missing actual params, falling back to canonical definitions"
      );
      return cloneParamDefinitions(canonicalParams).map((p) => ({
        ...p,
        used: false,
      }));
    }

    if (actualParams.length !== canonicalParams.length) {
      console.warn(
        "applyCanonicalParamNames: length mismatch (actual:",
        actualParams.length,
        "canonical:",
        canonicalParams.length,
        ")"
      );
    }

    return actualParams.map((param, idx) => {
      const canonical =
        canonicalParams[idx] ||
        canonicalParams[canonicalParams.length - 1] ||
        {};
      return {
        ...param,
        paramName: canonical.paramName || param.paramName,
        type: canonical.type || param.type,
      };
    });
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
      .map((block) => {
        return block.type + ":" + JSON.stringify(serializeBlockMinimal(block));
      })
      .join("|");
  }

  function showToastPromptImpl(message, onConfirm, onCancel) {
    const toast = document.createElement("div");
    toast.className = "toast-prompt";
    // ensure it's visible regardless of existing CSS
    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.zIndex = 20000;
    toast.style.background = "#222";
    toast.style.color = "#fff";
    toast.style.padding = "14px 20px";
    toast.style.borderRadius = "10px";
    toast.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
    toast.style.fontFamily = "Arial, sans-serif";
    toast.style.maxWidth = "320px";
    toast.style.animation = "fadeIn .3s ease";
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
    console.log("showToastPrompt: creating toast");
    document.body.appendChild(toast);

    const okBtn = toast.querySelector(".toast-ok");
    const cancelBtn = toast.querySelector(".toast-cancel");

    if (okBtn) {
      okBtn.addEventListener("click", function () {
        try {
          console.log("showToastPrompt: OK clicked");
          toast.remove();
        } catch (e) {}
        try {
          onConfirm();
        } catch (err) {
          console.error("onConfirm failed", err);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        try {
          console.log("showToastPrompt: Cancel clicked");
          toast.remove();
        } catch (e) {}
        try {
          onCancel();
        } catch (err) {
          console.error("onCancel failed", err);
        }
      });
    }
  }

  function cloneRobertaBlock(block, workspace, deep = true) {
    if (!block) return null;

    const clone = workspace.newBlock(block.type);

    block.inputList.forEach((input) => {
      input.fieldRow.forEach((field) => {
        if (field.name && typeof field.getValue === "function") {
          try {
            clone.setFieldValue(field.getValue(), field.name);
          } catch (e) {}
        }
      });
    });

    if (deep) {
      block.inputList.forEach((input) => {
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

        if (
          targetConn.type === Blockly.NEXT_STATEMENT ||
          targetConn.type === Blockly.PREVIOUS_STATEMENT
        ) {
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

  // ============================================================================
  // VISUAL HIGHLIGHTING AND DESIGN
  // ============================================================================
  /*
  function applyBorderGlow(block) {
    if (block.__borderInterval) return;

    let path = block.svgPath_;
    if (!path) return;

    if (!block.__origStroke) {
      // sanitize stroke color: Blockly may not accept 8-digit hex (#RRGGBBAA)
      var s = path.getAttribute("stroke") || "#000000";
      try {
        if (typeof s === "string" && /^#([0-9a-fA-F]{8})$/.test(s)) {
          // drop alpha channel
          s = "#" + s.substr(1, 6);
        }
      } catch (e) { }
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
*/
  function removeBorderGlow(block) {
    if (!block) return;

    if (block.__borderInterval) {
      clearInterval(block.__borderInterval);
      block.__borderInterval = null;
    }

    const hasStrokeData =
      block.__origStroke != null ||
      block.__origStrokeWidth != null ||
      block.__origStrokeOp != null;

    if (hasStrokeData) {
      const root = block.getSvgRoot();
      if (root) {
        const paths = root.querySelectorAll("path");
        paths.forEach((path) => {
          if (block.__origStroke != null) {
            var orig = block.__origStroke;
            try {
              if (
                typeof orig === "string" &&
                /^#([0-9a-fA-F]{8})$/.test(orig)
              ) {
                orig = "#" + orig.substr(1, 6);
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
      }

      delete block.__origStroke;
      delete block.__origStrokeWidth;
      delete block.__origStrokeOp;
    }

    if (
      Object.prototype.hasOwnProperty.call(block, "__dupOrigColour") &&
      block.__dupOrigColour != null &&
      typeof block.setColour === "function"
    ) {
      try {
        block.setColour(block.__dupOrigColour);
      } catch (e) {}
    }
    delete block.__dupOrigColour;
  }

  function mixColors(color1, color2, amount) {
    function hexToRgb(hex) {
      hex = hex.replace("#", "");
      let b = parseInt(hex, 16);
      return {
        r: (b >> 16) & 255,
        g: (b >> 8) & 255,
        b: b & 255,
      };
    }

    amount = Math.max(0, Math.min(1, amount));

    let c1 = hexToRgb(color1);
    let c2 = hexToRgb(color2);

    return `rgb(${Math.round(
      c1.r + (c2.r - c1.r) * amount
    )},${Math.round(c1.g + (c2.g - c1.g) * amount)},${Math.round(c1.b + (c2.b - c1.b) * amount)})`;
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
        let times =
          block.getInputTargetBlock("TIMES") || block.getField("TIMES");
        let inner = block.getInputTargetBlock("DO");
        return !!times && !!inner;
      }

      case "text_print":
      case "robActions_print":
        return !!block.getInputTargetBlock("TEXT") || !!block.getField("TEXT");

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
      inputs: {},
    };

    block.inputList.forEach((input) => {
      input.fieldRow.forEach((field) => {
        if (field.name) {
          obj.fields[field.name] = "__IGNORED__";
        }
      });
    });

    block.inputList.forEach((input) => {
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

  function getStructuralSequenceSignature(group) {
    if (!Array.isArray(group)) {
      return "";
    }
    return group.map((b) => structureKey(b)).join("|SEQ|");
  }

  function getLinearChainFromStart(startBlock) {
    // Build a linear chain starting from the block after `startBlock`.
    // Additionally, descend into any statement-inputs (e.g. the DO section
    // of IF/REPEAT blocks) and include those blocks (and their next-chains)
    // inline so the duplicate-detection can find repeated sequences that
    // occur inside nested statement bodies.
    const chain = [];
    if (!startBlock) return chain;

    // Use a visited set to avoid adding the same block multiple times
    const visited = new Set();

    // Also include statement-inputs that belong to the startBlock itself
    try {
      if (Array.isArray(startBlock.inputList) && startBlock.inputList.length) {
        startBlock.inputList.forEach((input) => {
          try {
            if (input && input.connection && input.connection.targetBlock) {
              let child = input.connection.targetBlock();
              while (child) {
                if (!visited.has(child.id)) {
                  chain.push(child);
                  visited.add(child.id);
                }
                // include child's subsequent next-chain as well
                let nc = child.getNextBlock && child.getNextBlock();
                while (nc) {
                  if (!visited.has(nc.id)) {
                    chain.push(nc);
                    visited.add(nc.id);
                  }
                  nc = nc.getNextBlock && nc.getNextBlock();
                }
                child = child.getNextBlock && child.getNextBlock();
              }
            }
          } catch (e) {}
        });
      }
    } catch (e) {}

    let b = startBlock.getNextBlock && startBlock.getNextBlock();
    while (b) {
      try {
        if (!visited.has(b.id)) {
          chain.push(b);
          visited.add(b.id);
        }

        // For each statement input on this block, inline its contained
        // chain (this handles IF/REPEAT 'do' sections).
        if (Array.isArray(b.inputList) && b.inputList.length) {
          b.inputList.forEach((input) => {
            try {
              if (input && input.connection && input.connection.targetBlock) {
                let child = input.connection.targetBlock();
                while (child) {
                  if (!visited.has(child.id)) {
                    chain.push(child);
                    visited.add(child.id);
                  }
                  // include child's subsequent next-chain as well
                  let nc = child.getNextBlock && child.getNextBlock();
                  while (nc) {
                    if (!visited.has(nc.id)) {
                      chain.push(nc);
                      visited.add(nc.id);
                    }
                    nc = nc.getNextBlock && nc.getNextBlock();
                  }
                  child = child.getNextBlock && child.getNextBlock();
                }
              }
            } catch (e) {}
          });
        }
      } catch (e) {}

      b = b.getNextBlock && b.getNextBlock();
    }

    return chain;
  }

  const MIN_DUP_SEQUENCE_LENGTH = 3;
  const MAX_DUP_SEQUENCE_LENGTH = 8;
  const MIN_DISTINCT_BLOCK_TYPES = 3;
  const DUPLICATE_SEQUENCE_COLORS = ["#43c208", "#43c208"];
  const DUPLICATE_SEQUENCE_ANIMATION_INTERVAL_MS = 450;
  const DROPDOWN_PARAM_NAME_PREFIX = "Chemistry Object";

  function getActiveDuplicateColour(workspace) {
    if (!Array.isArray(DUPLICATE_SEQUENCE_COLORS) || !workspace) {
      return DUPLICATE_SEQUENCE_COLORS[0] || "#43c208";
    }
    if (
      typeof workspace.__dupColourIndex !== "number" ||
      workspace.__dupColourIndex < 0
    ) {
      workspace.__dupColourIndex = 0;
    }
    const paletteSize = DUPLICATE_SEQUENCE_COLORS.length;
    if (paletteSize === 0) {
      return "#22c55e";
    }
    return DUPLICATE_SEQUENCE_COLORS[workspace.__dupColourIndex % paletteSize];
  }

  function applyDuplicateColour(block, workspace, overrideColour) {
    if (
      !block ||
      typeof block.getColour !== "function" ||
      typeof block.setColour !== "function"
    ) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(block, "__dupOrigColour")) {
      try {
        block.__dupOrigColour = block.getColour();
      } catch (e) {
        block.__dupOrigColour = null;
      }
    }
    const colour = overrideColour || getActiveDuplicateColour(workspace);
    try {
      block.setColour(colour);
    } catch (e) {}
  }

  function ensureDuplicateHighlightAnimation(workspace) {
    if (!workspace) return;
    if (
      !workspace.__dupColoredBlocks ||
      workspace.__dupColoredBlocks.size === 0
    ) {
      return;
    }
    if (
      !Array.isArray(DUPLICATE_SEQUENCE_COLORS) ||
      DUPLICATE_SEQUENCE_COLORS.length < 2
    ) {
      return;
    }
    if (workspace.__sequenceHighlightInterval) {
      return;
    }

    workspace.__sequenceHighlightInterval = setInterval(() => {
      if (
        !workspace.__dupColoredBlocks ||
        workspace.__dupColoredBlocks.size === 0
      ) {
        clearSequenceHighlights(workspace);
        return;
      }

      const paletteSize = DUPLICATE_SEQUENCE_COLORS.length;
      if (paletteSize < 2) {
        return;
      }

      const currentIndex =
        typeof workspace.__dupColourIndex === "number"
          ? workspace.__dupColourIndex
          : 0;
      workspace.__dupColourIndex = (currentIndex + 1) % paletteSize;
      const nextColour = getActiveDuplicateColour(workspace);

      workspace.__dupColoredBlocks.forEach((block) => {
        if (!block) return;
        if (typeof block.isDisposed === "function" && block.isDisposed()) {
          return;
        }
        applyDuplicateColour(block, workspace, nextColour);
      });
    }, DUPLICATE_SEQUENCE_ANIMATION_INTERVAL_MS);
  }

  function clearSequenceHighlights(workspace) {
    if (!workspace) return;
    const layer = workspace.__sequenceHighlightLayer;
    if (layer) {
      while (layer.firstChild) {
        layer.removeChild(layer.firstChild);
      }
    }
    if (workspace.__sequenceHighlightInterval) {
      clearInterval(workspace.__sequenceHighlightInterval);
      workspace.__sequenceHighlightInterval = null;
    }
    workspace.__dupColourIndex = 0;
    // Clear the shared clones array
    if (workspace.__highlightClones) {
      workspace.__highlightClones.length = 0;
    }
    if (workspace.__dupColoredBlocks && workspace.__dupColoredBlocks.size) {
      workspace.__dupColoredBlocks.forEach((block) => {
        removeBorderGlow(block);
      });
      workspace.__dupColoredBlocks.clear();
    }
  }

  function highlightSequenceGroup(group, workspace) {
    if (!workspace || !group || group.length === 0) return;

    if (!workspace.__dupColoredBlocks) {
      workspace.__dupColoredBlocks = new Set();
    }

    const visited = new Set();

    function tintBlockTree(block) {
      if (!block) return;

      const blockId = block.id || block;
      if (visited.has(blockId)) {
        return;
      }
      visited.add(blockId);

      if (
        typeof block.getColour === "function" &&
        typeof block.setColour === "function"
      ) {
        applyDuplicateColour(block, workspace);
      }
      workspace.__dupColoredBlocks.add(block);

      if (Array.isArray(block.inputList)) {
        block.inputList.forEach((input) => {
          if (
            input.connection &&
            typeof input.connection.targetBlock === "function"
          ) {
            let child = input.connection.targetBlock();
            while (child) {
              tintBlockTree(child);
              child = child.getNextBlock ? child.getNextBlock() : null;
            }
          }
        });
      }
    }

    group.forEach((blk) => tintBlockTree(blk));
    ensureDuplicateHighlightAnimation(workspace);
  }

  function highlightOnlyFunctionCandidates(workspace, startBlock, SEQ_LEN = 3) {
    // Clear old highlights ONLY if we are about to show something new or if we find nothing.
    // We defer clearing until we know the outcome.
    workspace.getAllBlocks().forEach((b) => {
      removeBorderGlow(b);
    });

    // If no startBlock provided, try to pick the best candidate from the workspace
    if (!startBlock) {
      try {
        const tops =
          (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];

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
          const all =
            (workspace.getAllBlocks && workspace.getAllBlocks()) || [];
          best = null;
          bestLen = -1;
          for (let b of all) {
            try {
              const ch = getLinearChainFromStart(b) || [];
              if (ch.length > bestLen) {
                bestLen = ch.length;
                best = b;
              }
            } catch (e) {}
          }
          startBlock = bestLen > 0 && best ? best : tops[0] || all[0] || null;
        }
      } catch (e) {
        console.warn(
          "highlightOnlyFunctionCandidates: error selecting startBlock",
          e
        );
      }
    }

    try {
      var sbId = startBlock && startBlock.id;
      var topsDbg =
        (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
      var firstTopId = topsDbg[0] && topsDbg[0].id;
    } catch (e) {}

    const chain = getLinearChainFromStart(startBlock) || [];
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
              cur.inputList.forEach(function (inp) {
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
          var tops =
            (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
          var startIndex = tops.indexOf(startBlock);
          if (startIndex < 0) startIndex = 0;
          for (var ti = startIndex; ti < tops.length; ti++) {
            collectFromBlock(tops[ti], alt);
          }
        }

        if (alt.length > 0) {
          chain.length = 0;
          Array.prototype.push.apply(chain, alt);
        }
      } catch (e) {
        console.warn(
          "highlightOnlyFunctionCandidates: alternative chain build failed",
          e
        );
      }
    }
    if (chain.length === 0) {
      try {
        const tops =
          (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
        console.warn("Repetition diagnostic: top blocks count =", tops.length);
        tops.slice(0, 10).forEach(function (b, i) {
          try {
            console.warn(
              " top[" + i + "] type=",
              b && b.type,
              "linearChainLen=",
              (getLinearChainFromStart(b) || []).length
            );
          } catch (e) {}
        });

        const all = (workspace.getAllBlocks && workspace.getAllBlocks()) || [];

        all.slice(0, 30).forEach(function (b, i) {
          try {
            var hasPrev = !!(
              b &&
              b.previousConnection &&
              b.previousConnection.targetConnection
            );
            var hasNext = !!(b && b.getNextBlock && b.getNextBlock());
          } catch (e) {}
        });
      } catch (e) {}
    }
    if (chain.length < SEQ_LEN) {
      clearSequenceHighlights(workspace);
      return;
    }

    const sequences = {};
    const minSequenceLength = Math.max(
      SEQ_LEN || MIN_DUP_SEQUENCE_LENGTH,
      MIN_DUP_SEQUENCE_LENGTH
    );
    const maxSequenceLength = Math.max(
      minSequenceLength,
      MAX_DUP_SEQUENCE_LENGTH
    );

    for (let startIndex = 0; startIndex < chain.length; startIndex++) {
      const typeCounts = new Map();

      for (
        let length = 1;
        length <= maxSequenceLength && startIndex + length <= chain.length;
        length++
      ) {
        const candidateBlock = chain[startIndex + length - 1];

        if (!blockIsStructurallyComplete(candidateBlock)) {
          break;
        }

        const blockType = candidateBlock.type || "__unknown__";
        typeCounts.set(blockType, (typeCounts.get(blockType) || 0) + 1);

        if (length < minSequenceLength) {
          continue;
        }

        if (typeCounts.size < MIN_DISTINCT_BLOCK_TYPES) {
          continue;
        }

        const group = chain.slice(startIndex, startIndex + length);
        group.__startIndex = startIndex;
        const key = group.map((b) => structureKey(b)).join("|SEQ|");

        if (!sequences[key]) sequences[key] = [];
        sequences[key].push(group);
      }
    }

    const duplicateMeta = {};

    Object.entries(sequences).forEach(([key, groups]) => {
      if (groups.length >= 2) {
        const startIds = groups
          .map((g) => (g[0] && g[0].id) || "")
          .filter(Boolean);
        const uniqueStartIds = Array.from(new Set(startIds));
        const startSignature = uniqueStartIds.slice().sort().join("|");
        const startPositions = groups.map((g) =>
          typeof g.__startIndex === "number" ? g.__startIndex : -1
        );
        const lastStartIndex = startPositions.length
          ? Math.max.apply(Math, startPositions)
          : -1;

        const meta = {
          key,
          groups,
          length: groups[0] ? groups[0].length : 0,
          startIds: uniqueStartIds,
          startSignature,
          lastStartIndex,
          overshadowed: false,
        };
        duplicateMeta[key] = meta;
      }
    });
    const duplicateList = Object.values(duplicateMeta).sort((a, b) => {
      const lenA = a.length || 0;
      const lenB = b.length || 0;
      if (lenB !== lenA) {
        return lenB - lenA;
      }
      const lastA =
        typeof a.lastStartIndex === "number" ? a.lastStartIndex : -1;
      const lastB =
        typeof b.lastStartIndex === "number" ? b.lastStartIndex : -1;
      return lastB - lastA;
    });
    const primaryDuplicateKey = duplicateList.length
      ? duplicateList[0].key
      : null;
    const claimedSignatures = new Set();
    duplicateList.forEach((meta) => {
      if (!meta.startSignature) {
        meta.overshadowed = false;
        return;
      }
      if (claimedSignatures.has(meta.startSignature)) {
        meta.overshadowed = true;
      } else {
        claimedSignatures.add(meta.startSignature);
        meta.overshadowed = false;
      }
    });

    const sequenceKeys = Object.keys(sequences);
    for (const key of sequenceKeys) {
      const groups = sequences[key];
      const registryEntry = structuralFunctionRegistry[key];
      const duplicateInfo = duplicateMeta[key];

      if (registryEntry && groups.length >= 1) {
        const sequenceKey = key + "::reuse";
        if (
          promptedSignatures.has(sequenceKey) ||
          rejectedSignatures.has(sequenceKey)
        ) {
          // If already prompted, ensure it's still highlighted (in case of redraw)
          if (promptedSignatures.has(sequenceKey)) {
            groups.forEach((group) => {
              highlightSequenceGroup(group, workspace);
            });
          }
          return;
        }

        // Found a new match! Clear old highlights first.
        clearSequenceHighlights(workspace);

        const entryObj =
          typeof registryEntry === "string"
            ? { name: registryEntry, params: [] }
            : registryEntry;
        if (!entryObj || !entryObj.name) {
          return;
        }

        // Highlight the group
        groups.forEach((group) => {
          highlightSequenceGroup(group, workspace);
        });

        promptedSignatures.add(sequenceKey);

        setTimeout(() => {
          showToastPrompt(
            `You've already created "${entryObj.name}" from this sequence. Replace it with that function call?`,
            function () {
              try {
                const canonicalParams = cloneParamDefinitions(
                  entryObj.params || []
                );
                groups.forEach((group) => {
                  insertProcedureCall(
                    group,
                    entryObj.name,
                    workspace,
                    canonicalParams
                  );
                });
                clearSequenceHighlights(workspace);
                rejectedSignatures.delete(sequenceKey);
              } catch (err) {
                console.error(
                  "insertProcedureCall for existing function failed",
                  err
                );
              }
              promptedSignatures.delete(sequenceKey);
            },
            function () {
              clearSequenceHighlights(workspace);
              rejectedSignatures.add(sequenceKey);
              console.log(
                "toast Cancel clicked: user declined existing function reuse."
              );
              promptedSignatures.delete(sequenceKey);
            }
          );
        }, 2000);
        return;
      }

      if (groups.length >= 2) {
        if (primaryDuplicateKey && key !== primaryDuplicateKey) {
          continue;
        }
        if (duplicateInfo && duplicateInfo.overshadowed) {
          continue;
        }
        const sequenceKey = key + "::duplicate";
        if (
          promptedSignatures.has(sequenceKey) ||
          rejectedSignatures.has(sequenceKey)
        ) {
          // If already prompted, ensure it's still highlighted
          if (promptedSignatures.has(sequenceKey)) {
            duplicateGroups.forEach((group) => {
              highlightSequenceGroup(group, workspace);
            });
          }
          return;
        }

        // Found a new match! Clear old highlights first.
        clearSequenceHighlights(workspace);
        const duplicateGroups = duplicateInfo ? duplicateInfo.groups : groups;

        duplicateGroups.forEach((group) => {
          highlightSequenceGroup(group, workspace);
        });

        promptedSignatures.add(sequenceKey);

        setTimeout(() => {
          showToastPrompt(
            "Identical block sequence detected. Replace with a custom block?",
            function () {
              try {
                createCustomBlockFromSequence(duplicateGroups, workspace);
                clearSequenceHighlights(workspace);
                rejectedSignatures.delete(sequenceKey);
              } catch (err) {
                console.error("createCustomBlockFromSequence failed", err);
              }
            },
            function () {
              // User said no. We can remove highlighting if we want.
              clearSequenceHighlights(workspace);
              duplicateGroups.length = 0;
              clearObjectStore(sequences);
              clearObjectStore(duplicateMeta);
              promptedSignatures.add(sequenceKey);
              //rejectedSignatures.clear();
              rejectedSignatures.add(sequenceKey);
              console.log("toast Cancel clicked: user declined replacement.");
            }
          );
        }, 2000);
        return;
      }
    }

    // If we reached here, it means we didn't return early (no match found).
    // So we should clear any existing highlights.
    clearSequenceHighlights(workspace);
  }

  //add eventlistener for newRunBrick
  function initRunBrick(workspace) {
    let RunBrick = document.getElementById("newRunBrick");
    if (RunBrick) {
      // must use anonymous function to pass parameters to newRunBrick()
      RunBrick.addEventListener("click", function () {
        newRunBrick(workspace);
      });
    }
  }

  // highlightOnlyFunctionCandidates is called in main.js
  // call my functions same way
  async function newRunBrick(workspace) {
    const apiUrl = "http://127.0.0.1:5000"; // Flask app URL
    console.info("launching viewer!");

    //wait for viewer to be ready
    await getCall(apiUrl + "/viewer").then((_) => {});

    let xmlProgram = Blockly.Xml.workspaceToDom(workspace);
    let xmlTextProgram = Blockly.Xml.domToText(xmlProgram); //delete later
    //console.info("xmlProgram: ", xmlProgram);
    //console.info("xmlProgram: ", xmlProgram);

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

  function normalizeArgKey(raw) {
    if (raw == null) {
      return raw;
    }
    if (typeof raw === "string") {
      return raw.trim();
    }
    return raw;
  }

  function resolveArgumentValue(rawValue, mapOverride) {
    if (rawValue == null) {
      return rawValue;
    }
    const lookup = mapOverride || argsMap;
    const normalized = normalizeArgKey(rawValue);
    if (lookup && typeof lookup.has === "function" && lookup.has(normalized)) {
      return lookup.get(normalized);
    }
    return normalized;
  }

  function queueBlocks(blockElems) {
    //gets blocks, puts in queue (array) and/or map depending on procedure or not
    let blockStack = [];
    let fallbackStack = [];
    procedureMap = new Map(); //reset global map
    for (let index = 0; index < blockElems.length; index++) {
      const element = blockElems[index];
      let type = element.getAttribute("type");

      if (
        type == "procedures_defnoreturn" ||
        type == "robProcedures_defnoreturn"
      ) {
        //defining custom block
        let procedureName = element.childNodes[1].childNodes[0].nodeValue;
        //stupid nested if-else, bc element.childNodes[3] only works for our block, bc extra child 'Comment'
        if (type == "procedures_defnoreturn") {
          //add stack element's children as procedure
          procedureMap.set(procedureName, element.childNodes[3].childNodes);
        } else {
          procedureMap.set(procedureName, element.childNodes[2].childNodes);
        }

        //move past the blocks nested in procedure - so we dont accidentally add the procedure to the queue again
        let nestedBlocks = element.getElementsByTagName("block");
        index += nestedBlocks.length;
      } else {
        // Record blocks that belong to the main program starting at the start block
        if (type === "robControls_start") {
          const startStatement = findStatementElement(element, "ST");
          blockStack = blockStack.concat(
            collectBlocksFromStatement(startStatement)
          );
        }
        fallbackStack.push(element);
      }
    }
    if (blockStack.length === 0) {
      // Fallback to previous behaviour if no start block chain was found
      blockStack = fallbackStack;
    }
    return blockStack;
  }

  function findFirstChildElement(parent, tagName) {
    if (!parent || !parent.childNodes) {
      return null;
    }
    const normalized = tagName ? tagName.toLowerCase() : null;
    for (let i = 0; i < parent.childNodes.length; i++) {
      const child = parent.childNodes[i];
      if (
        child &&
        child.nodeType === 1 &&
        child.tagName &&
        (!normalized || child.tagName.toLowerCase() === normalized)
      ) {
        return child;
      }
    }
    return null;
  }

  function getDirectChildElements(parent, tagName) {
    if (!parent || !parent.childNodes) {
      return [];
    }
    const matches = [];
    const normalized = tagName ? tagName.toLowerCase() : null;
    for (let i = 0; i < parent.childNodes.length; i++) {
      const child = parent.childNodes[i];
      if (
        child &&
        child.nodeType === 1 &&
        child.tagName &&
        (!normalized || child.tagName.toLowerCase() === normalized)
      ) {
        matches.push(child);
      }
    }
    return matches;
  }

  function getFirstChildBlock(parent) {
    const blocks = getDirectChildElements(parent, "block");
    return blocks.length ? blocks[0] : null;
  }

  function getNextBlockElement(blockElement) {
    const nextNode = findFirstChildElement(blockElement, "next");
    if (!nextNode) {
      return null;
    }
    return getFirstChildBlock(nextNode);
  }

  function findValueElement(blockElement, name) {
    const values = getDirectChildElements(blockElement, "value");
    return values.find(
      (v) => (v.getAttribute && v.getAttribute("name")) === name
    );
  }

  function findStatementElement(blockElement, name) {
    const statements = getDirectChildElements(blockElement, "statement");
    return statements.find(
      (s) => (s.getAttribute && s.getAttribute("name")) === name
    );
  }

  function collectBlocksFromStatement(statementElement) {
    const sequence = [];
    if (!statementElement) {
      return sequence;
    }
    let current = getFirstChildBlock(statementElement);
    while (current) {
      sequence.push(current);
      current = getNextBlockElement(current);
    }
    return sequence;
  }

  function trimOrNull(text) {
    if (text == null) {
      return null;
    }
    const trimmed = String(text).trim();
    return trimmed.length ? trimmed : null;
  }

  function extractLiteralFromValueNode(valueElement) {
    if (!valueElement) {
      return null;
    }

    if (typeof valueElement.getElementsByTagName === "function") {
      const fieldNodes = valueElement.getElementsByTagName("field");
      if (fieldNodes && fieldNodes.length) {
        for (let i = 0; i < fieldNodes.length; i++) {
          const field = fieldNodes[i];
          const text = field && trimOrNull(field.textContent);
          if (text != null) {
            return text;
          }
        }
      }

      const mutationNodes = valueElement.getElementsByTagName("mutation");
      if (mutationNodes && mutationNodes.length) {
        for (let i = 0; i < mutationNodes.length; i++) {
          const attrValue = trimOrNull(mutationNodes[i]?.getAttribute("value"));
          if (attrValue != null) {
            return attrValue;
          }
        }
      }
    }

    const fallback = trimOrNull(valueElement.textContent);
    if (fallback != null) {
      return fallback;
    }

    return null;
  }

  function getFieldValue(element, fieldName) {
    if (!element) {
      return null;
    }
    const fields = element.getElementsByTagName("field");
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if ((field.getAttribute && field.getAttribute("name")) === fieldName) {
        return trimOrNull(field.textContent);
      }
    }
    return null;
  }

  async function evaluateValueBlock(apiUrl, valueElement) {
    if (!valueElement) {
      return null;
    }
    const block = getFirstChildBlock(valueElement);
    if (block) {
      return await evaluateBlockElement(apiUrl, block);
    }
    const literal = extractLiteralFromValueNode(valueElement);
    if (literal == null) {
      return null;
    }
    const numeric = Number(literal);
    return isNaN(numeric) ? literal : numeric;
  }

  function toNumber(value) {
    if (typeof value === "number") {
      return value;
    }
    const numeric = Number(value);
    return isNaN(numeric) ? 0 : numeric;
  }

  function toBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
    return !!value;
  }

  async function evaluateBlockElement(apiUrl, blockElement) {
    if (!blockElement) {
      return null;
    }
    const type = blockElement.getAttribute("type");
    switch (type) {
      case "logic_boolean": {
        const field = getFieldValue(blockElement, "BOOL") || "FALSE";
        return field.toUpperCase() === "TRUE";
      }
      case "logic_negate": {
        const inner = await evaluateValueBlock(
          apiUrl,
          findValueElement(blockElement, "BOOL")
        );
        return !toBoolean(inner);
      }
      case "logic_operation": {
        const op = (getFieldValue(blockElement, "OP") || "AND").toUpperCase();
        const a = await evaluateValueBlock(
          apiUrl,
          findValueElement(blockElement, "A")
        );
        const b = await evaluateValueBlock(
          apiUrl,
          findValueElement(blockElement, "B")
        );
        if (op === "AND") {
          return toBoolean(a) && toBoolean(b);
        }
        return toBoolean(a) || toBoolean(b);
      }
      case "logic_compare": {
        const op = (getFieldValue(blockElement, "OP") || "EQ").toUpperCase();
        const a = await evaluateValueBlock(
          apiUrl,
          findValueElement(blockElement, "A")
        );
        const b = await evaluateValueBlock(
          apiUrl,
          findValueElement(blockElement, "B")
        );
        switch (op) {
          case "EQ":
            return a == b; // eslint-disable-line eqeqeq
          case "NEQ":
            return a != b; // eslint-disable-line eqeqeq
          case "LT":
            return toNumber(a) < toNumber(b);
          case "LTE":
            return toNumber(a) <= toNumber(b);
          case "GT":
            return toNumber(a) > toNumber(b);
          case "GTE":
            return toNumber(a) >= toNumber(b);
          default:
            return false;
        }
      }
      case "math_number": {
        const value = getFieldValue(blockElement, "NUM");
        return toNumber(value);
      }
      case "text": {
        return getFieldValue(blockElement, "TEXT") || "";
      }
      case "naoSensors_bagIsFull": {
        const result = await getCall(apiUrl + "/bag_full");
        if (
          result &&
          typeof result === "object" &&
          result.bag_is_full != null
        ) {
          return !!result.bag_is_full;
        }
        return false;
      }
      case "naoSensors_solutionReady": {
        const result = await getCall(apiUrl + "/solution_ready");
        if (
          result &&
          typeof result === "object" &&
          result.solution_ready != null
        ) {
          return !!result.solution_ready;
        }
        return false;
      }
      default: {
        const literal = extractLiteralFromValueNode(blockElement);
        if (literal != null) {
          return literal;
        }
      }
    }
    return null;
  }

  function buildProcedureCallArgMap(callElement, previousArgsMap) {
    const mutationNode = findFirstChildElement(callElement, "mutation");
    const argNodes = mutationNode
      ? getDirectChildElements(mutationNode, "arg")
      : [];
    const valueLookup = Object.create(null);
    const valueChildren = getDirectChildElements(callElement, "value");

    valueChildren.forEach((valueElement) => {
      const nameAttr =
        (valueElement.getAttribute && valueElement.getAttribute("name")) || "";
      const match = nameAttr.match(/^ARG(\d+)$/i);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (!isNaN(idx)) {
          valueLookup[idx] = valueElement;
        }
      }
    });

    const argMap = new Map();

    argNodes.forEach((argNode, argIndex) => {
      if (!argNode || typeof argNode.getAttribute !== "function") {
        return;
      }
      const paramName = normalizeArgKey(argNode.getAttribute("name"));
      if (!paramName) {
        return;
      }
      const valueElement = valueLookup[argIndex];
      const literalValue = extractLiteralFromValueNode(valueElement);
      if (literalValue != null) {
        const resolvedValue = resolveArgumentValue(
          literalValue,
          previousArgsMap
        );
        argMap.set(paramName, normalizeArgKey(resolvedValue));
      }
    });

    return argMap;
  }

  async function executeProcedureCall(apiUrl, callElement, procedureName) {
    if (!procedureMap.has(procedureName)) {
      return;
    }

    const previousArgsMap = argsMap;
    try {
      const currentArgsMap = buildProcedureCallArgMap(
        callElement,
        previousArgsMap
      );
      argsMap = currentArgsMap;
      await blockAPICalls(apiUrl, procedureMap.get(procedureName));
    } finally {
      argsMap = previousArgsMap;
    }
  }

  async function blockAPICalls(apiUrl, blockElements) {
    for (let index = 0; index < blockElements.length; index++) {
      const element = blockElements[index];

      let url = "";
      let obj;
      //rn everything is just GET. Maybe POST is more correct but if it works why bother
      switch (element.getAttribute("type")) {
        case "controls_if":
        case "robControls_if":
        case "robControls_ifElse": {
          const conditionValue = findValueElement(element, "IF0");
          const shouldRun = await evaluateValueBlock(apiUrl, conditionValue);
          if (toBoolean(shouldRun)) {
            const doStatement = findStatementElement(element, "DO0");
            const doBlocks = collectBlocksFromStatement(doStatement);
            await blockAPICalls(apiUrl, doBlocks);
          } else {
            const elseStatement = findStatementElement(element, "ELSE");
            if (elseStatement) {
              const elseBlocks = collectBlocksFromStatement(elseStatement);
              await blockAPICalls(apiUrl, elseBlocks);
            }
          }
          continue;
        }
        case "controls_repeat_ext":
        case "controls_repeat":
        case "robControls_repeat": {
          let timesBlock = findValueElement(element, "TIMES");
          let iterations = await evaluateValueBlock(apiUrl, timesBlock);
          if (iterations == null) {
            iterations = toNumber(getFieldValue(element, "TIMES"));
          }
          iterations = Math.max(0, Math.floor(toNumber(iterations)));
          const bodyStatement =
            findStatementElement(element, "DO") ||
            findStatementElement(element, "DO0");
          const bodyBlocks = collectBlocksFromStatement(bodyStatement);
          for (let i = 0; i < iterations; i++) {
            await blockAPICalls(apiUrl, bodyBlocks);
          }
          continue;
        }
        case "naoActions_moveToPosition":
          //The values we want to get are nested like:
          // value, block, field, text.nodeValue (each being a xml element)
          //The x value in <field> x_value </field>, is treated as a childNode
          let val =
            element.childNodes[0].childNodes[0].childNodes[0].childNodes[0]
              .nodeValue;

          let x = resolveArgumentValue(val);
          val =
            element.childNodes[1].childNodes[0].childNodes[0].childNodes[0]
              .nodeValue;
          let y = resolveArgumentValue(val);
          val =
            element.childNodes[2].childNodes[0].childNodes[0].childNodes[0]
              .nodeValue;
          let z = resolveArgumentValue(val);

          url = apiUrl + "/move_pos/" + x + "/" + y + "/" + z;

          await getCall(url);
          continue;
        case "naoActions_moveToObject":
          obj = resolveArgumentValue(
            element.childNodes[0].childNodes[0].nodeValue
          );
          url = apiUrl + "/move_obj/" + obj;
          await getCall(url);
          continue;
        case "naoActions_pickObject":
          //pickObject has field <field name="OBJECT">RED_OBJECT</field>
          //to get the actual value of the field, we must access the child's child
          obj = resolveArgumentValue(
            element.childNodes[0].childNodes[0].nodeValue
          );
          url = apiUrl + "/pick_obj/" + obj;
          await getCall(url);
          continue;
        case "naoActions_grasp":
          url = apiUrl + "/grasp";
          await getCall(url);
          continue;
        case "naoActions_release":
          url = apiUrl + "/release";
          await getCall(url);
          continue;
        case "naoActions_mixSolution":
          url = apiUrl + "/mix_solution";
          await getCall(url);
          continue;
        case "naoActions_analyzeSolution":
          url = apiUrl + "/analyze_solution";
          await getCall(url);
          continue;
        case "robControls_wait_time": //using OpenRoberta's pre-defined wait block - see WaitTimeStmt.java
          let seconds =
            element.childNodes[0].childNodes[0].childNodes[0].childNodes[0]
              .nodeValue;
          seconds = resolveArgumentValue(seconds);
          url = apiUrl + "/wait/" + seconds;
          await getCall(url);
          continue;
        case "naoActions_moveUp":
          // Field-based block: <field name="DZ">10</field>
          let dzVal = element.childNodes[0].childNodes[0].nodeValue;
          dzVal = resolveArgumentValue(dzVal);
          // API expects centimeters integer
          url = apiUrl + "/move_up/" + Math.round(Number(dzVal));
          await getCall(url);
          continue;
        case "naoActions_getResultInLaptop":
          url = apiUrl + "/laptop_result";
          await getCall(url);
          continue;
        case "robProcedures_callnoreturn":
        case "customProcedures_callnoreturn":
          {
            const procedureName = element.childNodes[0].getAttribute("name");
            console.info("procedure found: ", procedureName);
            await executeProcedureCall(apiUrl, element, procedureName);
          }
          continue;
      }
    }
    return true;
  }

  async function getCall(url) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        return `Error from Python: ${data.error}`;
      }

      return data;
    } catch (error) {
      return `An error occurred: ${error}`;
    }
  }
  // Exported API for CommonJS/AMD/browser global
  return {
    customFunctionRegistry:
      typeof customFunctionRegistry !== "undefined"
        ? customFunctionRegistry
        : {},
    showToastPrompt:
      typeof showToastPrompt !== "undefined" ? showToastPrompt : null,
    cloneRobertaBlock:
      typeof cloneRobertaBlock !== "undefined" ? cloneRobertaBlock : null,
    safeCloneBlock:
      typeof safeCloneBlock !== "undefined" ? safeCloneBlock : null,
    insertProcedureCall:
      typeof insertProcedureCall !== "undefined" ? insertProcedureCall : null,
    wipeConnections:
      typeof wipeConnections !== "undefined" ? wipeConnections : null,
    serializeBlockMinimal:
      typeof serializeBlockMinimal !== "undefined"
        ? serializeBlockMinimal
        : null,
    makeBlock: typeof makeBlock !== "undefined" ? makeBlock : null,
    buildTestCase: typeof buildTestCase !== "undefined" ? buildTestCase : null,
    buildLargeTestCase:
      typeof buildLargeTestCase !== "undefined" ? buildLargeTestCase : null,
    mixColors: typeof mixColors !== "undefined" ? mixColors : null,
    runTest: typeof runTest !== "undefined" ? runTest : null,
    run2ndTest: typeof run2ndTest !== "undefined" ? run2ndTest : null,
    extractLiteralParameters:
      typeof extractLiteralParameters !== "undefined"
        ? extractLiteralParameters
        : null,
    createCustomBlockFromSequence:
      typeof createCustomBlockFromSequence !== "undefined"
        ? createCustomBlockFromSequence
        : null,
    safeDispose: typeof safeDispose !== "undefined" ? safeDispose : null,
    getSequenceSignature:
      typeof getSequenceSignature !== "undefined" ? getSequenceSignature : null,
    applyBorderGlow:
      typeof applyBorderGlow !== "undefined" ? applyBorderGlow : null,
    removeBorderGlow:
      typeof removeBorderGlow !== "undefined" ? removeBorderGlow : null,
    highlightOnlyFunctionCandidates:
      typeof highlightOnlyFunctionCandidates !== "undefined"
        ? highlightOnlyFunctionCandidates
        : null,
    initRunBrick: typeof initRunBrick !== "undefined" ? initRunBrick : null,
    revealDefinitionWorkspacePane:
      typeof revealDefinitionWorkspacePane !== "undefined"
        ? revealDefinitionWorkspacePane
        : null,
    collapseDefinitionWorkspacePane:
      typeof collapseDefinitionWorkspacePane !== "undefined"
        ? collapseDefinitionWorkspacePane
        : null,
    setupDefinitionWorkspaceToggleButton:
      typeof setupDefinitionWorkspaceToggleButton !== "undefined"
        ? setupDefinitionWorkspaceToggleButton
        : null,
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
