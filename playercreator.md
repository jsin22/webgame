Instructions for Claude: Character Creation & Auth System
Objective: Replace the current landing page with a robust Player Auth and Customization system. The system must handle two flows: New Player (Sign Up) and Returning Player (Login).

1. UI & Authentication Logic
Initial View: Provide two buttons: "Create New Player" and "Returning Player."

Sign Up Flow:

Input fields for Username and Password.

Toggle for Gender (Male/Female).

Color Pickers (Primary colors: Red, Blue, Yellow, Green, etc.) for Shirt, Pants, and Shoes.

Persistent Storage: Save the player’s credentials and appearance object to localStorage.

Login Flow: Validate the entered name/password against the stored data. If successful, load that specific character's visuals.

2. Character Visuals & Sprites
Skin Tones: * Male: Light Brown.

Female: Brown (slightly darker/richer than the male).

Hair Styles: * Male: Short/Standard.

Female: Long/Shoulder-length style.

Dynamic Coloring: Use CSS filters or separate sprite layers to apply the user-selected colors for the Shirt, Pants, and Shoes dynamically.

3. Technical Requirements
Data Structure: Store the player as an object:

JavaScript
{
  username: "Player1",
  password: "encrypted_string", 
  gender: "female",
  colors: { shirt: "blue", pants: "red", shoes: "black" }
}
Transition: Once "Create" or "Login" is pressed, clear the UI and initialize the game world using the saved customization data.

Bonus - 
Do we use Canvas or DOM elements for the character. If it’s a 2D canvas game, ask it to "use a layering system for the sprites" so the clothes don't look like flat blobs of color.
