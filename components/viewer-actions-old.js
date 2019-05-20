/**
 * Gamepad controls for A-Frame.
 *
 * Stripped-down version of: https://github.com/donmccurdy/aframe-gamepad-controls
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

var Actions = {
	LOOK_UP: GamepadButton.FACE_4,
	LOOK_DOWN: GamepadButton.FACE_1,
	LOOK_LEFT: GamepadButton.FACE_3,
	LOOK_RIGHT: GamepadButton.FACE_2,

	MOVE_FORWARD: GamepadButton.DPAD_UP,
	MOVE_BACKWARD: GamepadButton.DPAD_DOWN,
	MOVE_LEFT: GamepadButton.DPAD_LEFT,
	MOVE_RIGHT: GamepadButton.DPAD_RIGHT,
};

function GamepadButtonEvent (type, index, details) {
  this.type = type;
  this.index = index;
  this.pressed = details.pressed;
  this.value = details.value;
};
//import { GamepadButton } from '../lib/GamepadButton.js';
//import { GamepadButtonEvent } from '../lib/GamepadButtonEvent.js';

const JOYSTICK_EPS = 0.2;

AFRAME.registerComponent('viewer-actions', {

  /*******************************************************************
   * Statics
   */

  GamepadButton: GamepadButton,
  Actions: Actions,

  /*******************************************************************
   * Schema
   */
  schema: {
    // Controller 0-3
    controller:        { default: 0, oneOf: [0, 1, 2, 3] },
    // Enable/disable features
    enabled:           { default: true },
    // Debugging
    debug:             { default: false },
    // Heading element for rotation
    camera:          { default: '[camera]', type: 'selector' },
    // Rotation sensitivity
    rotationSensitivity:  { default: 2.0 },
    // Movement speed
    speed: 			{ default: 0.3 }
  },

  /*******************************************************************
   * Core
   */

  /**
   * Called once when component is attached. Generally for initial setup.
   */
  init: function () {
    const scene = this.el.sceneEl;
    this.prevTime = window.performance.now();

    // Button state
    this.buttons = {};

    // Rotation
    const rotation = this.el.object3D.rotation;
    this.pitch = new THREE.Object3D();
    this.pitch.rotation.x = THREE.Math.degToRad(rotation.x);
    this.yaw = new THREE.Object3D();
    this.yaw.position.y = 10;
    this.yaw.rotation.y = THREE.Math.degToRad(rotation.y);
    this.yaw.add(this.pitch);

    scene.addBehavior(this);
    
    this.el.sceneEl.addEventListener('camera-set-active',(evt) => {
    	data.camera = evt.detail.cameraEl;
	});
	/*
	this.el.sceneEl.addEventListener('exit-vr',() => {
    	data.camera = document.querySelector("#camera");
	});*/
	
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
    this.updateRotation(dt);
    this.updateVelocityDelta(dt);
  },

  /**
   * Called when a component is removed (e.g., via removeAttribute).
   * Generally undoes all modifications to the entity.
   */
  remove: function () { },

  /*******************************************************************
   * Movement
   */

  isVelocityActive: function () {
    if (!this.data.enabled || !this.isConnected()) return false;

    const dpad = this.getDpad(),
        joystick0 = this.getJoystick(0),
        inputX = dpad.x || joystick0.x,
        inputY = dpad.y || joystick0.y;

    return Math.abs(inputX) > JOYSTICK_EPS || Math.abs(inputY) > JOYSTICK_EPS;
  },

  updateVelocityDelta: function (dt) {
  	if (!this.isVelocityActive()) return;



  	const yaw = this.yaw;
    const pitch = this.pitch;
  	const data = this.data;
    var dpad = this.getDpad(),
        joystick0 = this.getJoystick(0),
        inputX = dpad.x || joystick0.x,
        inputY = dpad.y || joystick0.y,
        dVelocity = new THREE.Vector3();

    const lookControls = data.camera.components['look-controls'];
    const hasLookControls = lookControls && lookControls.pitchObject && lookControls.yawObject;

    // Sync with look-controls pitch/yaw if available.
    if (hasLookControls) {
      pitch.rotation.copy(lookControls.pitchObject.rotation);
      yaw.rotation.copy(lookControls.yawObject.rotation);
    }

    if (Math.abs(inputX) < JOYSTICK_EPS) {
      inputX = 0;
    }
    if (Math.abs(inputY) < JOYSTICK_EPS) {
      inputY = 0;
    }
    dVelocity.x = inputY * Math.sin(yaw.rotation.y);
    dVelocity.z = inputY * Math.cos(yaw.rotation.y);

    dVelocity.x += inputX * Math.sin(yaw.rotation.y + (Math.PI / 2));
    dVelocity.z += inputX * Math.cos(yaw.rotation.y + (Math.PI / 2));
    //TODO add code for sideways movement
    dVelocity.x = this.el.object3D.position.x + (dVelocity.x * dt / 1000);
    dVelocity.z = this.el.object3D.position.z + (dVelocity.z * dt / 1000);
    //data.camera.object3D.position.x += dVelocity.x * dt / 1000;
    //data.camera.object3D.position.z += dVelocity.z * dt / 1000;
    this.el.object3D.position.set(dVelocity.x, this.el.object3D.position.y, dVelocity.z);
  },

  /*******************************************************************
   * Rotation
   */

  isRotationActive: function () {
    if (!this.data.enabled || !this.isConnected()) return false;

    const joystick1 = this.getJoystick(1);
    var vertActive = this.getButton(Actions.LOOK_UP) || this.getButton(Actions.LOOK_DOWN);
    var horzActive = this.getButton(Actions.LOOK_LEFT) || this.getButton(Actions.LOOK_RIGHT)
    return Math.abs(joystick1.x) > JOYSTICK_EPS || Math.abs(joystick1.y) > JOYSTICK_EPS || vertActive || horzActive;
  },

  updateRotation: function (dt) {
    if (!this.isRotationActive()) return;

    const data = this.data;
    const yaw = this.yaw;
    const pitch = this.pitch;
    const lookControls = data.camera.components['look-controls'];
    const hasLookControls = lookControls && lookControls.pitchObject && lookControls.yawObject;

    // Sync with look-controls pitch/yaw if available.
    if (hasLookControls) {
      pitch.rotation.copy(lookControls.pitchObject.rotation);
      yaw.rotation.copy(lookControls.yawObject.rotation);
    }

    var vertState = 0;
    if(this.getButton(Actions.LOOK_UP)) {
    	vertState = -1;
    } else if (this.getButton(Actions.LOOK_DOWN)) {
    	vertState = 1;
    }

    var horzState = 0;
    if(this.getButton(Actions.LOOK_RIGHT)) {
    	horzState = 1;
    } else if (this.getButton(Actions.LOOK_LEFT)) {
    	horzState = -1;
    }


    const lookVector = new THREE.Vector2(horzState, vertState);
	//const lookVector = this.getJoystick(1);

    if (Math.abs(lookVector.x) <= JOYSTICK_EPS) lookVector.x = 0;
    if (Math.abs(lookVector.y) <= JOYSTICK_EPS) lookVector.y = 0;

    lookVector.multiplyScalar(data.rotationSensitivity * dt / 1000);
    yaw.rotation.y -= lookVector.x;
    pitch.rotation.x -= lookVector.y;
    pitch.rotation.x = Math.max(- Math.PI / 2, Math.min(Math.PI / 2, pitch.rotation.x));
    this.el.object3D.rotation.set(pitch.rotation.x, yaw.rotation.y, 0);

    // Sync with look-controls pitch/yaw if available.
    if (hasLookControls) {
      lookControls.pitchObject.rotation.copy(pitch.rotation);
      lookControls.yawObject.rotation.copy(yaw.rotation);
    }
    console.log(pitch.rotation.x + " : " + yaw.rotation.y);
    console.log(this.el.childNodes);
  },

  /*******************************************************************
   * Button events
   */

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
   * Returns the state of the given joystick (0 or 1) as a THREE.Vector2.
   * @param  {number} id The joystick (0, 1) for which to find state.
   * @return {THREE.Vector2}
   */
  getJoystick: function (index) {
    const gamepad = this.getGamepad();
    switch (index) {
      case 0: return new THREE.Vector2(gamepad.axes[0], gamepad.axes[1]);
      case 1: return new THREE.Vector2(gamepad.axes[2], gamepad.axes[3]);
      default: throw new Error('Unexpected joystick index "%d".', index);
    }
  },

  /**
   * Returns the state of the dpad as a THREE.Vector2.
   * @return {THREE.Vector2}
   */
  getDpad: function () {
    const gamepad = this.getGamepad();
    if (!gamepad.buttons[GamepadButton.DPAD_RIGHT]) {
      return new THREE.Vector2();
    }
    return new THREE.Vector2(
      (gamepad.buttons[GamepadButton.DPAD_RIGHT].pressed ? 1 : 0)
      + (gamepad.buttons[GamepadButton.DPAD_LEFT].pressed ? -1 : 0),
      (gamepad.buttons[GamepadButton.DPAD_UP].pressed ? -1 : 0)
      + (gamepad.buttons[GamepadButton.DPAD_DOWN].pressed ? 1 : 0)
    );
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