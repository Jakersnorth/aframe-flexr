# aframe-viewer-actions
Viewer actions is a component built for A-Frame using the Gamepad API as a proof-of-concept for standardizing actions in VR with the intent to promote accessibility. This component enables movement of the camera and any number of objects in a scene with the use of 10 binary inputs.

Base code adapted from stripped-down version of: https://github.com/donmccurdy/aframe-gamepad-controls

# How to use this component 

To use this component attach it to the camera rig in your scene with the property "isCameraRig: true"

Also attach this component to any objects in your scene that you want to have manipulated by the user
If an object is a child of another object in the scene, attach this component to the parent object as well with the property "isControllable: false"

# How the actions are mapped to inputs
 
The default configuration is set to match the x-input controller standard most prominently found on xbox controllers
(https://docs.microsoft.com/en-us/windows/desktop/xinput/xinput-and-directinput)

Actions can be remapped to different controllers and different layouts by modifying the GamepadButton and Actions objects

For more information about the Gamepad API, see:
https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API