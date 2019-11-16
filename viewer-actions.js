
 
/**
 * Standardized accessible VR controls for A-Frame using the Gamepad API for browsers
 *
 * Base code adapted from stripped-down version of: https://github.com/donmccurdy/aframe-gamepad-controls
 *
 * To use this component attach it to the camera rig in your scene with the property "isCameraRig: true"
 *
 * Also attach this component to any objects in your scene that you want to have manipulated by the user
 * If an object is a child of another object in the scene, attach this component to the parent object as well with the property "isControllable: false"
 * 
 * The default configuration is set to match the x-input controller standard most prominently found on xbox controllers
 * (https://docs.microsoft.com/en-us/windows/desktop/xinput/xinput-and-directinput)
 *
 * Actions can be remapped to different controllers and different layouts by modifying the GamepadButton and Actions objects
 *
 * For more information about the Gamepad API, see:
 * https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
 */
var GamepadButton = {
  FACE_1: 0,
  FACE_2: 1,
  FACE_3: 2,
  FACE_4: 3,

  L_SHOULDER_1: 4,
  R_SHOULDER_1: 5,
  L_SHOULDER_2: 6,
  R_SHOULDER_2: 7,

  SELECT: 8,
  START: 9,

  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,

  VENDOR: 16,
};

var ControllerActions = {
  'LOOK_UP': GamepadButton.FACE_4,
  'LOOK_DOWN': GamepadButton.FACE_1,
  'LOOK_LEFT': GamepadButton.FACE_3,
  'LOOK_RIGHT': GamepadButton.FACE_2,

  'MOVE_FORWARD': GamepadButton.DPAD_UP,
  'MOVE_BACKWARD': GamepadButton.DPAD_DOWN,
  'MOVE_LEFT': GamepadButton.DPAD_LEFT,
  'MOVE_RIGHT': GamepadButton.DPAD_RIGHT,
  'MOVE_UP': GamepadButton.L_SHOULDER_1,
  'MOVE_DOWN': GamepadButton.R_SHOULDER_1,

  'CONTROL_TARGET': GamepadButton.SELECT,
  'CONTROL_TARGET_CHILD': GamepadButton.START,

  'INTERACT_TARGET': GamepadButton.R_SHOULDER_2
};

var KeyboardCodes = {
  LEFT_ARROW: 37,
  UP_ARROW: 38,
  RIGHT_ARROW: 39,
  DOWN_ARROW: 40,

  A_KEY: 65,
  W_KEY: 87,
  D_KEY: 68,
  S_KEY: 83,

  Q_KEY: 81,
  E_KEY: 69,

  C_KEY: 67,
  V_KEY: 86,

  SPACE_KEY: 32
}

var KeyboardActions = {
  'LOOK_UP' : KeyboardCodes.UP_ARROW,
  'LOOK_DOWN': KeyboardCodes.DOWN_ARROW,
  'LOOK_LEFT': KeyboardCodes.LEFT_ARROW,
  'LOOK_RIGHT': KeyboardCodes.RIGHT_ARROW,

  'MOVE_FORWARD': KeyboardCodes.W_KEY,
  'MOVE_BACKWARD': KeyboardCodes.S_KEY,
  'MOVE_LEFT': KeyboardCodes.A_KEY,
  'MOVE_RIGHT': KeyboardCodes.D_KEY,
  'MOVE_UP': KeyboardCodes.Q_KEY,
  'MOVE_DOWN': KeyboardCodes.E_KEY,

  'CONTROL_TARGET': KeyboardCodes.C_KEY,
  'CONTROL_TARGET_CHILD': KeyboardCodes.V_KEY,

  'INTERACT_TARGET': KeyboardCodes.SPACE_KEY
}

// Sets minimum sensitivity of joystick inputs (currently not used)
const JOYSTICK_EPS = 0.2;

AFRAME.registerComponent('vieweractions', {

  /*******************************************************************
   * Statics
   */

  GamepadButton: GamepadButton,
  ControllerActions: ControllerActions,
  KeyboardCodes: KeyboardCodes,
  KeyboardActions: KeyboardActions,

  /*******************************************************************
   * Schema
   */
  schema: {
    // Controller 0-3
    controller:        { default: 0, oneOf: [0, 1, 2, 3] },
    // Enable/disable features
    enabled:           { default: false },
    // Denotes if entity is the camera rig
    isCameraRig:     { default: false },
    // Denotes if controllable or only focusable
    isControllable:    { default: true },
    // Debugging
    debug:             { default: false },
    // Rotation sensitivity
    rotationSensitivity:  { default: 2.0 },
    // Movement speed
    speed:      { default: 0.3 }
  },

  /*******************************************************************
   * Core
   */

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {

    let that = this;
    const scene = this.el.sceneEl;
    this.prevTime = window.performance.now();

    // Track control state of other objects besides camera rig
    this.controllingTarget = false;
    this.prevTargetControlPressed = false;
    this.prevTargetControlChildPressed = false;
    this.prevTargetInteractPressed = false;
    this.currTarget = null;

    // Rotation
    const rotation = this.el.object3D.rotation;
    this.pitch = new AFRAME.THREE.Object3D();
    this.pitch.rotation.x = AFRAME.THREE.Math.degToRad(rotation.x);
    this.yaw = new AFRAME.THREE.Object3D();
    this.yaw.position.y = 10;
    this.yaw.rotation.y = AFRAME.THREE.Math.degToRad(rotation.y);
    this.yaw.add(this.pitch);
    this.worldYawAxis = new AFRAME.THREE.Vector3(0,1,0);

    //useful incase visual feedback of targeted object is change to material
    //this.currentMat = null;

    // If this entity is the camera than use as the master for exchanging control between entities and construction of control tree
    if(this.data.isCameraRig) {
      this.controlTree = [];
      this.treeTracker = [0];

      // Sparse array to track currently pressed keys
      this.keyPresses = {};

      // Function to parse initial scene structure when loaded to create starting control tree
      this.constructControlTree = function() {
        document.querySelector('[camera]').removeAttribute('wasd-controls');
        document.querySelector('[camera]').removeAttribute('look-controls');

        that.parseChildrenForControlTree(that.el.sceneEl, that.controlTree);
        console.log(that.controlTree);

        // Start listening for new controllable entities that get added at runtime to add to control tree
        that.el.sceneEl.addEventListener("newActionComponent", that.callAppendToControlTree);

        // Start listening for controllable entities that get removed at runtime to remove from control tree
        that.el.sceneEl.addEventListener("removeActionComponent", that.callRemoveFromControlTree);
      };

      // Iterates through entity tree of scene for all objects with standard actions component attached to construct a control tree
      this.parseChildrenForControlTree = function(root, controlTreeBranch) {
        var childArray = root.children;
        for(var i = 0; i < childArray.length; i++) {
          if(childArray[i].getAttribute("vieweractions") != null && !childArray[i].getAttribute("vieweractions").isCameraRig) {
            controlTreeBranch.push({entity: childArray[i], children: []});
            that.parseChildrenForControlTree(childArray[i], controlTreeBranch[controlTreeBranch.length - 1].children);
          }
        }
      };

      // Support method to act as callback function and call append function with error check
      this.callAppendToControlTree = function(e) {
        console.log("appending new to tree");
        if(!that.appendToControlTree(e.detail.newEl, that.el.sceneEl, that.controlTree)) {
          console.log("control tree append update failed");
        }
      };

      // Recursively find which entity the newly added entity is a child of and add to that branch in the control tree
      this.appendToControlTree = function(newEl, root, controlTreeBranch) {
        var entParent = newEl.parentElement;
        // New entity is a child of the current node, add to this branch
        if(root.isEqualNode(entParent)) {
          controlTreeBranch.push({entity: newEl, children: []});
          return true;
        } else {
          var i = 0;
          var posFound = false;
          // Iterate through children of current entity to check if new entity is a subchild
          while(i < controlTreeBranch.length && !posFound) {
            posFound = that.appendToControlTree(newEl, controlTreeBranch[i].entity, controlTreeBranch[i].children);
            i += 1;
          }
          return posFound;
        }
      };

      this.callRemoveFromControlTree = function(e) {
        if(!that.removeFromControlTree(e.detail.remEl, that.controlTree)) {
          console.log("control tree remove update failed");
        }
      };

      this.removeFromControlTree = function(remEl, controlTreeBranch) {
        var i = 0;
        var posFound = false;
        while(i < controlTreeBranch.length && !posFound) {
          if(remEl.isEqualNode(controlTreeBranch[i].entity)) {
            controlTreeBranch.splice(i, 1);
            this.switchToCameraControl();
            return true;
          } else {
            posFound = that.removeFromControlTree(remEl, controlTreeBranch[i].children);
          }
        }
        return posFound;
      }

      this.trackKeyDown = function(event) {
        that.keyPresses[event.keyCode] = 1;
      }

      this.trackKeyUp = function(event) {
        that.keyPresses[event.keyCode] = 0;
      }

      document.addEventListener("keydown", this.trackKeyDown);
      document.addEventListener("keyup", this.trackKeyUp);

      // Add event listener to construct control tree once entire initial scene is loaded
      this.el.sceneEl.addEventListener("loaded", this.constructControlTree);
    } 
    else {
      // If controllable entity is not the camera rig than emit an event incase this component was added after initial scene loading
      this.el.sceneEl.emit("newActionComponent", {newEl: this.el});
    }

    scene.addBehavior(this);
  },

  /**
   * Called when component is attached and when component data changes.
   * Generally modifies the entity based on the data.
   */
  update: function () { this.tick(); },

  /**
   * Called on each iteration of main render loop.
   */
  tick: function (t, dt) {
    //this.updateButtonState();
    if(this.data.isCameraRig) {
      this.updateTargetControl();
      this.updateTargetControlChild();
      this.updateTargetInteract();
    }
    if(this.data.enabled) {
      this.updateRotation(dt);
      this.updateVelocityDelta(dt);
    }
  },

  /**
   * Called when a component is removed (e.g., via removeAttribute).
   * Generally undoes all modifications to the entity.
   */
  remove: function () { 
    if(this.data.isCameraRig) {
      this.el.sceneEl.removeEventListener("controllableTarget", this.controlRelinquished);
      this.el.sceneEl.removeEventListener("loaded", this.constructControlTree);
      this.el.sceneEl.removeEventListener("newActionComponent", this.callAppendToControlTree);
      this.el.sceneEl.removeEventListener("removeActionComponent", this.callRemoveFromControlTree);
    }
    else {
      this.el.sceneEl.emit("removeActionComponent", {remEl: this.el});
    }
  },

  /**
   * Used to establish this entity as being currently controlled, modify this function for user feedback
   */
  setFocus: function(cRef) {
    if(this.data.isControllable) {
      this.data.enabled = true;
      cRef.components.vieweractions.data.enabled = false;
    }
    this.cameraRigRef = cRef;
    this.el.emit('raycaster-intersected');
    //this.el.setAttribute("light", {"type": "point", "distance" : 5, "color": "blue" })
    //this.currentMat = this.el.getAttribute("material");
    //this.el.setAttribute("material", "shader: flat");
  },

  /**
   * Used to remove control from this entity, modify this function to undo anything from the setFocus function for user feedback
   */
  removeFocus: function() {
    this.data.enabled = false;
    this.cameraRigRef.components.vieweractions.data.enabled = true;
    this.el.emit('raycaster-intersected-cleared');
    //this.el.removeAttribute("light");
    //this.el.setAttribute("material", this.currentMat);
  },

  /*******************************************************************
   * Movement
   */

  isVelocityActive: function () {
    if (!this.data.enabled) return false;

    const inputX = this.getAction("MOVE_LEFT") || this.getAction("MOVE_RIGHT");
    const inputY = this.getAction("MOVE_FORWARD") || this.getAction("MOVE_BACKWARD");
    const inputZ = this.getAction("MOVE_UP") || this.getAction("MOVE_DOWN");

    return Math.abs(inputX) > JOYSTICK_EPS || Math.abs(inputY) > JOYSTICK_EPS || Math.abs(inputZ) > JOYSTICK_EPS;
  },

  updateVelocityDelta: function (dt) {
    if (!this.isVelocityActive()) return;

    const yaw = this.yaw;
    const pitch = this.pitch;
    const data = this.data;

    const dVelocity = new AFRAME.THREE.Vector3();

    //retrieve current inputs for each directional control
    let inputX = this.getAction("MOVE_LEFT") ? -1 : (this.getAction("MOVE_RIGHT") ? 1 : 0);

    let inputY = this.getAction("MOVE_FORWARD") ? -1 : (this.getAction("MOVE_BACKWARD") ? 1 : 0);

    let inputZ = this.getAction("MOVE_UP") ? 1 : (this.getAction("MOVE_DOWN") ? -1 : 0);

    //calculate correct movement direction based on current forward facing direction
    dVelocity.x = inputY * Math.sin(yaw.rotation.y);
    dVelocity.z = inputY * Math.cos(yaw.rotation.y);

    dVelocity.x += inputX * Math.sin(yaw.rotation.y + (Math.PI / 2));
    dVelocity.z += inputX * Math.cos(yaw.rotation.y + (Math.PI / 2));

    dVelocity.y = inputZ;

    //calculate global position based on previous position and movement changes
    dVelocity.x = this.el.object3D.position.x + (dVelocity.x * dt / 1000);
    dVelocity.z = this.el.object3D.position.z + (dVelocity.z * dt / 1000);
    dVelocity.y = this.el.object3D.position.y + (dVelocity.y * dt / 1000);

    this.el.object3D.position.set(dVelocity.x, dVelocity.y, dVelocity.z);
  },

  /*******************************************************************
   * Rotation
   */

  isRotationActive: function () {
    if (!this.data.enabled) return false;

    var vertActive = this.getAction("LOOK_UP") || this.getAction("LOOK_DOWN");
    var horzActive = this.getAction("LOOK_LEFT") || this.getAction("LOOK_RIGHT");
    return vertActive || horzActive;
  },

  updateRotation: function (dt) {
    if (!this.isRotationActive()) return;

    const data = this.data;
    const yaw = this.yaw;
    const pitch = this.pitch;

    var vertState = 0;
    if(this.getAction("LOOK_UP")) {
      vertState = -1;
    } else if (this.getAction("LOOK_DOWN")) {
      vertState = 1;
    }

    var horzState = 0;
    if(this.getAction("LOOK_RIGHT")) {
      horzState = 1;
    } else if (this.getAction("LOOK_LEFT")) {
      horzState = -1;
    }


    const lookVector = new AFRAME.THREE.Vector2(horzState, vertState);
  //const lookVector = this.getJoystick(1);

    if (Math.abs(lookVector.x) <= JOYSTICK_EPS) lookVector.x = 0;
    if (Math.abs(lookVector.y) <= JOYSTICK_EPS) lookVector.y = 0;

    lookVector.multiplyScalar(data.rotationSensitivity * dt / 1000);
    yaw.rotation.y -= lookVector.x;
    pitch.rotation.x -= lookVector.y;
    pitch.rotation.x = Math.max(- Math.PI / 6, Math.min(Math.PI / 6, pitch.rotation.x));

    //Threshold pitch rotation based on heading
    let cameraRigHeading = new AFRAME.THREE.Vector3();
    this.el.object3D.getWorldDirection(cameraRigHeading);
    let horizonOffset = cameraRigHeading.angleTo(this.worldYawAxis);
    if(this.data.isCameraRig) {
      lookVector.y = horizonOffset <= (Math.PI/3) && lookVector.y > 0 ? 0 : lookVector.y;
      lookVector.y = horizonOffset >=  (2*Math.PI/3) && lookVector.y < 0 ? 0 : lookVector.y;
    }

    //Old bounds checks
    //lookVector.y = pitch.rotation.x <= -1 * Math.PI / 6 ? 0 : lookVector.y;
    //lookVector.y = pitch.rotation.x >= Math.PI / 6 ? 0 : lookVector.y;

    // Rotate yaw in world space
    if(lookVector.x != 0) {    
      this.el.object3D.rotateOnWorldAxis(this.worldYawAxis, -1 * lookVector.x);
    }
    
    // Rotate pitch relative to current heading
    if(lookVector.y != 0) {
      let pitchAxis = new AFRAME.THREE.Vector3();
      //this.el.object3D.getWorldDirection(pitchAxis);
      if(this.data.isCameraRig) {
        document.querySelector('[camera]').object3D.getWorldDirection(pitchAxis);
      } else {
        this.el.object3D.getWorldDirection(pitchAxis);
      }
      pitchAxis.projectOnPlane(this.worldYawAxis);
      pitchAxis.applyAxisAngle(this.worldYawAxis, -Math.PI/2);
      this.el.object3D.rotateOnWorldAxis(pitchAxis.normalize(), lookVector.y);
    }

  },

  /*******************************************************************
   * Target selection for control transfer
   */


  // Checks for input to change current target at same level of control tree
  updateTargetControl: function() {
    //if(this.isConnected()) {
      //if currently controlling camera, switch to first entity in control tree
      if(!this.prevTargetControlPressed && (this.getAction("CONTROL_TARGET")) && !this.controllingTarget) {
        this.prevTargetControlPressed = true;
        //make sure there are objects besides the camera to control
        if(this.controlTree.length > 0) {
          let targetEntity = this.controlTree[this.treeTracker[0]];
          for(var i = 1; i < this.treeTracker.length; i++) {
            targetEntity = targetEntity.children[this.treeTracker[i]];
          }
          //targetEntity.entity.components.vieweractions.data.enabled = true;
          this.currTarget = targetEntity;
          targetEntity.entity.components.vieweractions.setFocus(this.el);
          this.controllingTarget = true;
          //disable control on camera
          //this.data.enabled = false;
        }
      }
      //switch control from one entity in control tree to next at same level
      else if (!this.prevTargetControlPressed && (this.getAction("CONTROL_TARGET"))  && this.controllingTarget) {
        //remove control from previous controlled entity
        if(this.currTarget) {
          this.currTarget.entity.components.vieweractions.removeFocus();
        }
        this.prevTargetControlPressed = true;

        //if at top level of control tree, iterate differently in case of end of tree
        if(this.treeTracker.length == 1) {
          var nextInd = this.treeTracker[0] + 1;
          if(nextInd >= this.controlTree.length) {
            this.controllingTarget = false;
            this.data.enabled = true;
            this.treeTracker[0] = 0;
          } else {
            this.treeTracker[0] = nextInd;
            this.currTarget = this.controlTree[this.treeTracker[0]];
            //targetEntity.entity.components.vieweractions.data.enabled = true;
            this.currTarget.entity.components.vieweractions.setFocus(this.el);
          }
        }
      //iterating through some lower level of control tree 
        else {
          let targetEntity = this.controlTree[this.treeTracker[0]];
          for(var i = 1; i < this.treeTracker.length - 1; i++) {
            targetEntity = targetEntity.children[this.treeTracker[i]];
          }
          var nextInd = this.treeTracker[this.treeTracker.length - 1] + 1;
          if(nextInd >= targetEntity.children.length) {
            this.treeTracker.pop();
          } else {
            targetEntity = targetEntity.children[nextInd];
            this.treeTracker[this.treeTracker.length - 1] = nextInd;
          }
          this.currTarget = targetEntity;
          this.currTarget.entity.components.vieweractions.setFocus(this.el);
        }
      }
      // Detect end of input, prevents multiple control transfers in a single input
      else if(this.prevTargetControlPressed && !(this.getAction("CONTROL_TARGET"))) {
        this.prevTargetControlPressed = false;
      }
    //}
  },

  // Checks for input to change control to first child entity of currently focused entity
  updateTargetControlChild: function() {
  //if(this.isConnected()) {
    if(!this.prevTargetControlChildPressed && (this.getAction("CONTROL_TARGET_CHILD")) && this.controllingTarget) {
      this.prevTargetControlChildPressed = true;
      let targetEntity = this.controlTree[this.treeTracker[0]];
        for(var i = 1; i < this.treeTracker.length - 1; i++) {
          targetEntity = targetEntity.children[this.treeTracker[i]];
        }
        if(targetEntity.children.length > 0) {
          targetEntity = targetEntity.children[0];
          this.treeTracker.push(0);

          if(this.currTarget) {
            this.currTarget.entity.components.vieweractions.removeFocus();
          }
          this.currTarget = targetEntity;
          targetEntity.entity.components.vieweractions.setFocus(this.el);
        }

    }
    else if(this.prevTargetControlChildPressed && !(this.getAction("CONTROL_TARGET_CHILD"))) {
        this.prevTargetControlChildPressed = false;
      }
  //}
  },

  updateTargetInteract: function() {
    if(!this.prevTargetInteractPressed && (this.getAction("INTERACT_TARGET")) && this.controllingTarget) {
      this.prevTargetInteractPressed = true;
      this.currTarget.entity.emit("click");
    }

    else if(this.prevTargetInteractPressed && !(this.getAction("INTERACT_TARGET"))) {
      this.prevTargetInteractPressed = false;
    }
  },

  switchToCameraControl: function() {
    //if(this.currTarget) {
    //  this.currTarget.entity.components.vieweractions.removeFocus();
    //}
    this.currTarget = null;
    this.controllingTarget = false;
    this.data.enabled = true;
    this.treeTracker = [0];
  },

  /*******************************************************************
   * Button events
   */
   /*
  updateButtonState: function () {
    const gamepad = this.getGamepad();
    if (this.data.enabled && gamepad) {

      // Fire DOM events for button state changes.
      for (var i = 0; i < gamepad.buttons.length; i++) {
        // Start tracking new pressed button
        if (gamepad.buttons[i].pressed && !this.buttons[i]) {
          this.emit(new GamepadButtonEvent('gamepadbuttondown', i, gamepad.buttons[i]));
        } 
        // Stop tracking released button
        else if (!gamepad.buttons[i].pressed && this.buttons[i]) {
          this.emit(new GamepadButtonEvent('gamepadbuttonup', i, gamepad.buttons[i]));
        }
        // Track current state of each button
        this.buttons[i] = gamepad.buttons[i].pressed;
      }

    } else if (Object.keys(this.buttons)) {
      // Reset state if controls are disabled or controller is lost.
      this.buttons = {};
    }
  },

  emit: function (event) {
    // Emit original event.
    this.el.emit(event.type, event);

    // Emit convenience event, identifying button index.
    this.el.emit(
      event.type + ':' + event.index,
      new GamepadButtonEvent(event.type, event.index, event)
    );
  },
  */


  /*******************************************************************
   * Gamepad state
   */

  /**
   * Returns the Gamepad instance attached to the component. If connected,
   * a proxy-controls component may provide access to Gamepad input from a
   * remote device.
   *
   * @return {Gamepad}
   */
  getGamepad: function () {
    const localGamepad = navigator.getGamepads
          && navigator.getGamepads()[this.data.controller],
        proxyControls = this.el.sceneEl.components['proxy-controls'],
        proxyGamepad = proxyControls && proxyControls.isConnected()
          && proxyControls.getGamepad(this.data.controller);
    return proxyGamepad || localGamepad;
  },

  /**
   * Returns the state of the given button.
   * @param  {number} index The button (0-N) for which to find state.
   * @return {GamepadButton}
   */
  getButton: function (index) {
    return this.getGamepad().buttons[index].pressed;
  },

  /**
   * Returns state of the given axis. Axes are labelled 0-N, where 0-1 will
   * represent X/Y on the first joystick, and 2-3 X/Y on the second.
   * @param  {number} index The axis (0-N) for which to find state.
   * @return {number} On the interval [-1,1].
   */
  getAxis: function (index) {
    return this.getGamepad().axes[index];
  },

  /**
   * Returns the state of the given joystick (0 or 1) as a AFRAME.THREE.Vector2.
   * @param  {number} id The joystick (0, 1) for which to find state.
   * @return {AFRAME.THREE.Vector2}
   */
  getJoystick: function (index) {
    const gamepad = this.getGamepad();
    switch (index) {
      case 0: return new AFRAME.THREE.Vector2(gamepad.axes[0], gamepad.axes[1]);
      case 1: return new AFRAME.THREE.Vector2(gamepad.axes[2], gamepad.axes[3]);
      default: throw new Error('Unexpected joystick index "%d".', index);
    }
  },

  /**
   * Returns the state of the dpad as a AFRAME.THREE.Vector2.
   * @return {AFRAME.THREE.Vector2}
   */
  getDpad: function () {
    const gamepad = this.getGamepad();
    if (!gamepad.buttons[GamepadButton.DPAD_RIGHT]) {
      return new AFRAME.THREE.Vector2();
    }
    return new AFRAME.THREE.Vector2(
      (gamepad.buttons[GamepadButton.DPAD_RIGHT].pressed ? 1 : 0)
      + (gamepad.buttons[GamepadButton.DPAD_LEFT].pressed ? -1 : 0),
      (gamepad.buttons[GamepadButton.DPAD_UP].pressed ? -1 : 0)
      + (gamepad.buttons[GamepadButton.DPAD_DOWN].pressed ? 1 : 0)
    );
  },

  /**
    * Returns the state of the given key
    * @param {number} index The key (0-N) for which to find state.   
    * @return {boolean}
  */
  getKeyState: function (index) {
    if(this.data.isCameraRig) {
      return this.keyPresses[index];
    } else {
      return this.cameraRigRef.components.vieweractions.getKeyState(index);
    }
  },

  getAction: function(action) {
    let actionState = this.getKeyState(KeyboardActions[action]);
    if(this.isConnected()) {
      actionState = actionState || this.getButton(ControllerActions[action])
    }
    return actionState;
  },


  /**
   * Returns true if the gamepad is currently connected to the system.
   * @return {boolean}
   */
  isConnected: function () {
    const gamepad = this.getGamepad();
    return !!(gamepad && gamepad.connected);
  },

  /**
   * Returns a string containing some information about the controller. Result
   * may vary across browsers, for a given controller.
   * @return {string}
   */
  getID: function () {
    return this.getGamepad().id;
  }
});