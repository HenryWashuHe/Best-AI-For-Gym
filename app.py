import os
import io
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin # Import cross_origin
from dotenv import load_dotenv
import base64
from PIL import Image
# Removed PIL Image import redundancy
import vertexai
from vertexai.generative_models import GenerativeModel, Part, FinishReason
import vertexai.preview.generative_models as generative_models
from google.oauth2 import service_account # Import service_account credentials
import base64 # Keep base64 for image encoding
import re # Import regex module
import numpy as np # Keep numpy for potential future use if needed
import cv2 # Keep OpenCV import if needed later
import mediapipe as mp # Keep MediaPipe import if needed later

# Load environment variables from .env file
load_dotenv()
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID")
LOCATION = os.getenv("GOOGLE_LOCATION")
# GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-flash-001") # No longer needed

# Basic validation
if not all([GOOGLE_APPLICATION_CREDENTIALS, PROJECT_ID, LOCATION]):
    print("ERROR: Google Cloud credentials or project info not fully set in .env file.")
    print("Please ensure GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_PROJECT_ID, and GOOGLE_LOCATION are set.")
    # Exit or handle appropriately if running in production
    # For development, we might allow it to continue but warn heavily.
    # exit(1) # Uncomment this line to enforce credential check before starting

# --- Explicitly set environment variable as a last resort ---
if PROJECT_ID:
    print(f"Attempting to explicitly set GOOGLE_CLOUD_PROJECT env var to: {PROJECT_ID}")
    os.environ['GOOGLE_CLOUD_PROJECT'] = PROJECT_ID
# ---

# Initialize Vertex AI
gemini_model = None
try:
    print(f"Initializing Vertex AI for project '{PROJECT_ID}' in location '{LOCATION}'...")
    # Explicitly load credentials from the specified file
    if GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(GOOGLE_APPLICATION_CREDENTIALS):
        print(f"Loading credentials from: {GOOGLE_APPLICATION_CREDENTIALS}")
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_APPLICATION_CREDENTIALS,
            scopes=['https://www.googleapis.com/auth/cloud-platform'] # Common scope
        )
        vertexai.init(project=PROJECT_ID, location=LOCATION, credentials=credentials)
        print("Vertex AI initialized successfully with explicit credentials.")
    else:
        print("WARNING: GOOGLE_APPLICATION_CREDENTIALS path not found or not set. Attempting default initialization.")
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        print("Vertex AI initialized successfully with default credentials.")

    # Load the Gemini model using the generic path
    generic_model_name = "models/gemini-1.5-flash" # Using generic path
    print(f"Loading Gemini model: {generic_model_name}")
    gemini_model = GenerativeModel(generic_model_name)
    print("Gemini model loaded.")
except Exception as e:
    print(f"ERROR: Failed to initialize Vertex AI or load Gemini model: {e}")
    # Handle error appropriately, maybe exit

app = Flask(__name__)
CORS(app) # Initialize global CORS

# Define safety settings globally
safety_settings = {
    generative_models.HarmCategory.HARM_CATEGORY_HATE_SPEECH: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    generative_models.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    generative_models.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    generative_models.HarmCategory.HARM_CATEGORY_HARASSMENT: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}

# --- Helper for Gemini ---
def generate_gemini_feedback(image_bytes, prompt):
    if not gemini_model:
        # Return structured error
        return {"feedback": "Error: Gemini model not initialized.", "exercise_name": None}

    image_part = Part.from_data(
        mime_type="image/jpeg", # Assuming JPEG, adjust if needed (e.g., image/png)
        data=image_bytes
    )

    generation_config = {
        "max_output_tokens": 2048,
        "temperature": 0.4,
        "top_p": 1.0,
        "top_k": 32,
    }

    try:
        print("Sending request to Gemini...")
        response = gemini_model.generate_content(
            [image_part, prompt],
            generation_config=generation_config,
            safety_settings=safety_settings, # Use global safety_settings
            stream=False,
        )
        print("Received response from Gemini.")

        # Handle potential safety blocks or empty responses
        if not response.candidates:
             feedback_text = "Error: No response generated, potentially due to safety filters or other issues."
             exercise_name = None
        elif response.candidates[0].finish_reason != FinishReason.STOP:
             feedback_text = f"Error: Generation stopped due to {response.candidates[0].finish_reason.name}"
             exercise_name = None
        else:
            feedback_text = response.text

            # Attempt to parse exercise name (case-insensitive)
            match = re.search(r"Exercise Identified:\s*([^\n]+)", feedback_text, re.IGNORECASE)
            exercise_name = match.group(1).strip().lower() if match else None
            print(f"Parsed exercise name: {exercise_name}") # Log parsed name

        return {"feedback": feedback_text, "exercise_name": exercise_name}


    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return {"feedback": f"Error generating feedback: {str(e)}", "exercise_name": None}


@app.route('/analyze', methods=['POST'])
@cross_origin() # Add decorator for specific handling
def analyze_image():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        try:
            # Read image file into memory
            image_bytes = file.read()
            print(f"Received file: {file.filename}, size: {len(image_bytes)} bytes")

            # Removed PIL validation block

            # --- Gemini Analysis ---
            # Updated prompt to ask for exercise name explicitly
            prompt = """
First, identify the main exercise being performed (e.g., Squat, Push-up, Lunge, Deadlift, Bench Press). State it clearly on a separate line like this:
Exercise Identified: [Exercise Name]

Then, analyze the posture and form in this image for that exercise.
Provide feedback in the following structure:
✅ What they did right: [Brief points]
⚠️ What needs fixing: [Brief points]
💡 Coaching advice: [Actionable tips for improvement]

If the exercise isn't clear or identifiable, state "Exercise Identified: Unknown" and describe the posture generally. Keep the feedback concise and encouraging.
            """

            analysis_result = generate_gemini_feedback(image_bytes, prompt.strip())
            # --- End Gemini Analysis ---

            # Return structured JSON
            return jsonify(analysis_result)

        except Exception as e:
            print(f"Error processing image: {e}")
            return jsonify({"error": f"Error processing image: {str(e)}"}), 500

    return jsonify({"error": "Unknown error"}), 500

# --- New Endpoint for Plan Generation ---
@app.route('/generate_plan', methods=['POST'])
@cross_origin() # Add decorator for specific handling
def generate_plan():
    # Handle POST request
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    print(f"Received plan request data: {data}") # Log received data

    # Basic validation of incoming data
    required_fields = ['age', 'gender', 'weight', 'height', 'activity', 'goal']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400

    # Construct the prompt for Gemini
    plan_prompt = f"""
Generate a sample personalized nutrition and workout plan based on the following user data:
- Age: {data.get('age')}
- Gender: {data.get('gender')}
- Weight: {data.get('weight')} kg
- Height: {data.get('height')} cm
- Activity Level: {data.get('activity')}
- Fitness Goal: {data.get('goal')}

Provide the output in two distinct sections: "Nutrition Plan:" and "Workout Plan:".

Nutrition Plan:
- Suggest estimated daily calorie and macronutrient targets (protein, carbs, fat).
- Provide sample meal ideas for breakfast, lunch, dinner, and snacks, focusing on whole foods. **Include estimated portion sizes (e.g., 1 cup oatmeal, 150g chicken breast, 1/2 avocado) for each component of the sample meals.** Keep it general and illustrative.

Workout Plan:
- Suggest a weekly workout frequency (e.g., 3-5 days/week).
- Provide a sample weekly split (e.g., full body, upper/lower, push/pull/legs).
- List sample exercises for each workout day, including sets and reps (e.g., Squats 3x8-12). Focus on compound movements and include some variety.

**Format the entire response using Markdown.** Use bullet points (`*` or `-`) for lists and bold (`**text**`) for emphasis where appropriate.

IMPORTANT: Start the response *immediately* with "**Nutrition Plan:**", followed by the nutrition details in Markdown. Then, start a new section *immediately* with "**Workout Plan:**", followed by the workout details in Markdown. Do not include any introductory or concluding sentences outside of these two sections. Add a disclaimer at the very end: "**Disclaimer:** This is an AI-generated sample plan. Consult professionals."
    """

    if not gemini_model:
         return jsonify({"error": "Gemini model not initialized"}), 500

    try:
        print("Sending request to Gemini for plan generation...")
        # Use the same Gemini helper, but just extract the feedback text
        # We don't need exercise name parsing here
        response = gemini_model.generate_content(
            [plan_prompt.strip()], # Only text prompt needed
            generation_config={"max_output_tokens": 3072, "temperature": 0.5}, # Allow more tokens, adjust temp
            safety_settings=safety_settings, # Reuse global safety settings
            stream=False,
        )
        print("Received response from Gemini.")

        if not response.candidates or response.candidates[0].finish_reason != FinishReason.STOP:
             error_msg = "Error: No response generated from AI."
             if response.candidates and response.candidates[0].finish_reason != FinishReason.STOP:
                 error_msg = f"Error: Generation stopped due to {response.candidates[0].finish_reason.name}"
             return jsonify({"error": error_msg}), 500

        full_plan_text = response.text

        # Attempt to split the response into nutrition and workout sections
        nutrition_match = re.search(r"Nutrition Plan:([\s\S]*?)Workout Plan:", full_plan_text, re.IGNORECASE)
        workout_match = re.search(r"Workout Plan:([\s\S]*?)Disclaimer:", full_plan_text, re.IGNORECASE) # Look for disclaimer

        nutrition_plan = nutrition_match.group(1).strip() if nutrition_match else "Could not parse nutrition plan."
        workout_plan = workout_match.group(1).strip() if workout_match else "Could not parse workout plan."

        # If parsing failed, provide the raw text in one section
        if not nutrition_match or not workout_match:
             print("Warning: Could not parse plan sections accurately. Returning raw text.")
             # Try a simpler split or return raw
             parts = re.split(r"Workout Plan:", full_plan_text, maxsplit=1, flags=re.IGNORECASE)
             if len(parts) == 2:
                 nutrition_plan = parts[0].replace("Nutrition Plan:", "", 1).strip()
                 workout_plan = parts[1].replace("Disclaimer:", "", 1).strip()
             else: # Fallback to raw
                 nutrition_plan = full_plan_text
                 workout_plan = ""


        return jsonify({
            "nutrition_plan": nutrition_plan,
            "workout_plan": workout_plan
        })

    except Exception as e:
        print(f"Error calling Gemini API for plan: {e}")
        return jsonify({"error": f"Error generating plan: {str(e)}"}), 500

# --- Sample Trainer Data ---
sample_trainers = [
    {
        "id": 1,
        "name": "Alex Chen",
        "specialty": ["weight_loss", "general_fitness", "squat", "deadlift"],
        "location": "Downtown Fitness Hub",
        "bio": "Certified trainer focused on sustainable weight loss and building functional strength."
    },
    {
        "id": 2,
        "name": "Maria Garcia",
        "specialty": ["muscle_gain", "strength_training", "bench_press", "deadlift"],
        "location": "Iron Paradise Gym",
        "bio": "Expert in hypertrophy and strength programming to help you build muscle effectively."
    },
    {
        "id": 3,
        "name": "Sam Taylor",
        "specialty": ["general_fitness", "mobility", "bodyweight_exercises", "push-up"],
        "location": "City Wellness Center",
        "bio": "Focuses on improving overall fitness, flexibility, and bodyweight mastery."
    },
     {
        "id": 4,
        "name": "Priya Singh",
        "specialty": ["weight_loss", "muscle_gain", "general_fitness", "squat", "lunge"],
        "location": "Peak Performance Studio",
        "bio": "Helps clients achieve diverse goals, from weight management to muscle building."
    }
]

# --- New Endpoint for Trainer Recommendations ---
@app.route('/recommend_trainers', methods=['POST'])
@cross_origin() # Apply CORS specifically
def recommend_trainers():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    user_goal = data.get('goal')
    # exercise = data.get('exercise') # Could potentially use exercise later

    if not user_goal:
        return jsonify({"error": "User goal is required"}), 400

    print(f"Received trainer recommendation request for goal: {user_goal}")

    recommended = []
    # Simple matching logic: find trainers whose specialty list includes the user's goal
    for trainer in sample_trainers:
        if user_goal in trainer["specialty"]:
            recommended.append(trainer)

    # If no direct match, maybe recommend general fitness trainers? (Optional enhancement)
    if not recommended:
         for trainer in sample_trainers:
            if "general_fitness" in trainer["specialty"]:
                recommended.append(trainer)

    # Limit recommendations for demo purposes
    recommendations_to_send = recommended[:3] # Send max 3

    print(f"Recommending trainers: {[t['name'] for t in recommendations_to_send]}")

    return jsonify({"recommendations": recommendations_to_send})


if __name__ == '__main__':
    # Use 0.0.0.0 to make it accessible on the network if needed,
    # otherwise 127.0.0.1 is fine for local development.
    app.run(debug=True, host='127.0.0.1', port=5000)
