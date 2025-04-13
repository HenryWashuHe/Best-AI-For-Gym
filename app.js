// --- Form Check Logic ---
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const feedbackSection = document.getElementById('feedback-section');

if (fileInput) { // Check if element exists before adding listener
    fileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];

        if (file) {
            // Clear previous preview and show original image/video
            if(preview) {
                 preview.innerHTML = ''; // Clear previous content
                 let element;
                 if (file.type.startsWith('image/')) {
                     element = document.createElement('img');
                     const reader = new FileReader();
                     reader.onload = function(e) { element.src = e.target.result; }
                     reader.readAsDataURL(file);
                     preview.appendChild(element);
                     // Call backend only for images initially
                     getFeedback(file);
                 } else if (file.type.startsWith('video/')) {
                     element = document.createElement('video');
                     element.src = URL.createObjectURL(file);
                     element.controls = true;
                     element.muted = true;
                     element.playsInline = true;
                     preview.appendChild(element);
                     // Add listener to capture frame and THEN call backend
                     element.addEventListener('loadeddata', () => {
                         // Set time slightly past beginning for frame capture
                         element.currentTime = 0.1;
                     });
                     element.addEventListener('seeked', () => {
                         captureFrame(element, file.name); // Capture frame and call getFeedback inside
                     }, { once: true });
                 } else {
                     preview.innerHTML = '<p>File type not supported for preview.</p>';
                 }
            }
            if(feedbackSection) feedbackSection.style.display = 'none'; // Hide old feedback

            // Removed direct getFeedback call here for videos

        } else {
            if(preview) preview.innerHTML = '<p>No file selected</p>';
            if(feedbackSection) feedbackSection.style.display = 'none';
        }
    }); // End of fileInput change listener
} // End of if(fileInput) check

// --- Function to call the backend API for form check ---
async function getFeedback(file) {
    const rawFeedbackEl = document.querySelector('#feedback-raw pre');
    const rawFeedbackContainer = document.getElementById('feedback-raw');
    const goodPointsContainer = document.getElementById('feedback-good');
    const fixPointsContainer = document.getElementById('feedback-fix');
    const advicePointsContainer = document.getElementById('feedback-advice');
    const exampleVideoSection = document.getElementById('example-video-section'); // Get video section

    // Ensure elements exist before manipulating
    if (!rawFeedbackEl || !rawFeedbackContainer || !goodPointsContainer || !fixPointsContainer || !advicePointsContainer || !feedbackSection || !exampleVideoSection) {
        console.error("Feedback display elements not found!");
        return;
    }

    // Hide all feedback parts initially and show spinner in raw area
    goodPointsContainer.style.display = 'none';
    fixPointsContainer.style.display = 'none';
    advicePointsContainer.style.display = 'none';
    exampleVideoSection.style.display = 'none'; // Hide video section too
    rawFeedbackEl.innerHTML = '<div class="spinner"></div>'; // Use spinner
    rawFeedbackContainer.style.display = 'flex';
    rawFeedbackContainer.style.justifyContent = 'center';
    rawFeedbackContainer.style.alignItems = 'center';
    feedbackSection.style.display = 'block';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('http://127.0.0.1:5000/analyze', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        // Pass feedback, exercise name
        displayFeedback(data.feedback, data.exercise_name);

    } catch (error) {
        console.error('Error fetching feedback:', error);
        // Pass error message and null for others
        displayFeedback(`Error getting feedback: ${error.message}`, null);
    }
}

// --- YouTube Embed URLs ---
const exerciseVideoMap = {
    'squat': 'https://www.youtube.com/embed/gslEzVggur8',
    'deadlift': 'https://www.youtube.com/embed/vfKwjT5-86k',
    'bench press': 'https://www.youtube.com/embed/_FkbD0FhgVE'
};

function displayFeedback(text, exerciseName) {
    const goodPointsEl = document.querySelector('#feedback-good p');
    const fixPointsEl = document.querySelector('#feedback-fix p');
    const advicePointsEl = document.querySelector('#feedback-advice p');
    const rawFeedbackEl = document.querySelector('#feedback-raw pre');
    const rawFeedbackContainer = document.getElementById('feedback-raw');
    const goodPointsContainer = document.getElementById('feedback-good');
    const fixPointsContainer = document.getElementById('feedback-fix');
    const advicePointsContainer = document.getElementById('feedback-advice');
    const exampleVideoSection = document.getElementById('example-video-section');
    const exampleVideoEmbed = document.getElementById('example-video-embed');
    const previewContainer = document.getElementById('preview'); // Keep preview container reference

    // Ensure elements exist
    if (!goodPointsEl || !fixPointsEl || !advicePointsEl || !rawFeedbackEl || !rawFeedbackContainer || !goodPointsContainer || !fixPointsContainer || !advicePointsContainer || !exampleVideoSection || !exampleVideoEmbed || !feedbackSection || !previewContainer) {
         console.error("Feedback display elements not found during display!");
         return;
    }

    // Clear previous feedback & hide sections
    goodPointsEl.textContent = '';
    fixPointsEl.textContent = '';
    advicePointsEl.textContent = '';
    rawFeedbackEl.textContent = text || ''; // Store raw text
    exampleVideoEmbed.innerHTML = ''; // Clear previous video
    goodPointsContainer.style.display = 'none';
    fixPointsContainer.style.display = 'none';
    advicePointsContainer.style.display = 'none';
    rawFeedbackContainer.style.display = 'none';
    exampleVideoSection.style.display = 'none';

    // Attempt to parse the structured feedback
    try {
        const goodMatch = text ? text.match(/✅ What they did right:([\s\S]*?)⚠️/) : null;
        const fixMatch = text ? text.match(/⚠️ What needs fixing:([\s\S]*?)💡/) : null;
        const adviceMatch = text ? text.match(/💡 Coaching advice:([\s\S]*)/) : null;

        let parsedSuccessfully = false;
        const goodText = goodMatch?.[1]?.trim();
        const fixText = fixMatch?.[1]?.trim();
        const adviceText = adviceMatch?.[1]?.trim();

        if (goodText) {
            goodPointsEl.textContent = goodText;
            goodPointsContainer.style.display = 'block';
            parsedSuccessfully = true;
        }
        if (fixText) {
            fixPointsEl.textContent = fixText;
            fixPointsContainer.style.display = 'block';
            parsedSuccessfully = true;
        }
        if (adviceText) {
            advicePointsEl.textContent = adviceText;
            advicePointsContainer.style.display = 'block';
            parsedSuccessfully = true;
        }

        // If parsing failed or produced no content, show the raw response
        // Also show raw if it's an error message
        if ((!parsedSuccessfully && text && text.trim()) || (text && text.startsWith("Error"))) {
            console.warn("Could not parse structured feedback or received error, showing raw response.");
            rawFeedbackContainer.style.display = 'block';
            // Ensure other sections are hidden if we show raw
            goodPointsContainer.style.display = 'none';
            fixPointsContainer.style.display = 'none';
            advicePointsContainer.style.display = 'none';
        } else {
            rawFeedbackContainer.style.display = 'none';
        }

        // --- Display Example Video ---
        if (exerciseName && exerciseVideoMap[exerciseName]) {
            const videoUrl = exerciseVideoMap[exerciseName];
            exampleVideoEmbed.innerHTML = `
                <iframe src="${videoUrl}"
                        title="YouTube video player for ${exerciseName}"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerpolicy="strict-origin-when-cross-origin"
                        allowfullscreen>
                </iframe>`;
            exampleVideoSection.style.display = 'block';
        } else {
             exampleVideoSection.style.display = 'none';
             if(exerciseName && exerciseName !== 'unknown') {
                 console.log(`No example video found for exercise: ${exerciseName}`);
             }
        }
        // --- End Display Example Video ---

    } catch (error) {
        console.error("Error processing feedback:", error);
        rawFeedbackContainer.style.display = 'block'; // Show raw on error
        rawFeedbackEl.textContent = text || `JS Error: ${error.message}`; // Display original text or JS error
        exampleVideoSection.style.display = 'none';
        goodPointsContainer.style.display = 'none';
        fixPointsContainer.style.display = 'none';
        advicePointsContainer.style.display = 'none';
    }

    feedbackSection.style.display = 'block';
}


// --- Function to capture a video frame ---
function captureFrame(videoElement, originalFilename) {
    console.log("Attempting to capture frame...");
    const canvas = document.createElement('canvas');
    // Check if video dimensions are available
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
        console.error("Video dimensions not available for frame capture.");
        displayFeedback("Error: Could not get video dimensions for frame capture.", null);
        return;
    }
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');

    try {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function(blob) {
            if (blob) {
                console.log("Frame captured successfully, sending to backend.");
                const frameFile = new File([blob], `frame_${originalFilename}.jpg`, { type: 'image/jpeg' });
                getFeedback(frameFile); // Call getFeedback with the captured frame
            } else {
                console.error("Failed to create blob from canvas.");
                displayFeedback("Error: Could not capture video frame.", null);
            }
        }, 'image/jpeg', 0.9);
    } catch (error) {
        console.error("Error drawing video frame to canvas:", error);
        displayFeedback("Error: Could not process video frame.", null);
    }
}


// --- Plan Generation Logic ---
const planForm = document.getElementById('plan-form');
const planOutputSection = document.getElementById('plan-output-section');
const nutritionPlanEl = document.querySelector('#nutrition-plan div');
const workoutPlanEl = document.querySelector('#workout-plan div');
const planLoadingEl = document.getElementById('plan-loading');
const generatePlanBtn = document.getElementById('generatePlanBtn');
const markdownConverter = new showdown.Converter();

if (planForm) {
    planForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // Prevent default form submission

        if (!nutritionPlanEl || !workoutPlanEl || !planLoadingEl || !planOutputSection || !generatePlanBtn) {
            console.error("Plan generation elements not found!");
            return;
        }

        // Show loading state with spinner
        planLoadingEl.innerHTML = '<div class="spinner"></div>';
        planLoadingEl.style.display = 'flex';
        nutritionPlanEl.parentElement.style.display = 'none';
        workoutPlanEl.parentElement.style.display = 'none';
        planOutputSection.style.display = 'block';
        generatePlanBtn.disabled = true;

        const formData = new FormData(planForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('http://127.0.0.1:5000/generate_plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { /* Ignore */ }
                throw new Error(errorMsg);
            }

            const planData = await response.json();

            const nutritionHtml = markdownConverter.makeHtml(planData.nutrition_plan || 'No nutrition plan generated.');
            const workoutHtml = markdownConverter.makeHtml(planData.workout_plan || 'No workout plan generated.');

            nutritionPlanEl.innerHTML = nutritionHtml;
            workoutPlanEl.innerHTML = workoutHtml;
            nutritionPlanEl.parentElement.style.display = 'block';
            workoutPlanEl.parentElement.style.display = 'block';

        } catch (error) {
            console.error('Error generating plan:', error);
            nutritionPlanEl.innerHTML = `<strong>Error:</strong> ${error.message}`;
            workoutPlanEl.innerHTML = '';
            nutritionPlanEl.parentElement.style.display = 'block';
            workoutPlanEl.parentElement.style.display = 'none';
        } finally {
            planLoadingEl.style.display = 'none';
            generatePlanBtn.disabled = false;
        }
    });
} else {
    console.error("Plan form not found!");
}

// --- Trainer Recommendation Logic ---
const findTrainersBtn = document.getElementById('findTrainersBtn');
const trainerRecommendationsSection = document.getElementById('trainer-recommendations-section');
const trainerListEl = document.getElementById('trainer-list');
const trainerLoadingEl = document.getElementById('trainer-loading');

if (findTrainersBtn) {
    findTrainersBtn.addEventListener('click', async function() {
        const goalInput = document.getElementById('goal');
        const userGoal = goalInput ? goalInput.value : null;

        if (!userGoal) {
            alert("Please select a fitness goal in the form above first.");
            return;
        }
        if (!trainerLoadingEl || !trainerListEl || !trainerRecommendationsSection) {
             console.error("Trainer recommendation elements not found!");
             return;
        }

        // Show loading state with spinner
        trainerLoadingEl.innerHTML = '<div class="spinner"></div>';
        trainerLoadingEl.style.display = 'flex';
        trainerListEl.innerHTML = '';
        trainerRecommendationsSection.style.display = 'block';
        findTrainersBtn.disabled = true;

        try {
            const response = await fetch('http://127.0.0.1:5000/recommend_trainers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ goal: userGoal }),
            });

             if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { /* Ignore */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            displayTrainers(data.recommendations);

        } catch (error) {
             console.error('Error fetching trainers:', error);
             trainerListEl.innerHTML = `<p>Error finding trainers: ${error.message}</p>`;
        } finally {
            trainerLoadingEl.style.display = 'none';
            findTrainersBtn.disabled = false;
        }
    });
} else {
     console.error("Find Trainers button not found!");
}

function displayTrainers(trainers) {
     if (!trainerListEl) return; // Guard clause
    trainerListEl.innerHTML = '';

    if (!trainers || trainers.length === 0) {
        trainerListEl.innerHTML = '<p>No trainers found matching your goal.</p>';
        return;
    }

    trainers.forEach(trainer => {
        const card = document.createElement('div');
        card.classList.add('trainer-card');
        card.innerHTML = `
            <h5>${trainer.name}</h5>
            <p><strong>Location:</strong> ${trainer.location}</p>
            <p>${trainer.bio}</p>
            <p class="specialty">Specialties: ${trainer.specialty.join(', ')}</p>
        `;
        trainerListEl.appendChild(card);
    });
}

// Show the "Find Trainers" button only after a plan is generated
if (planForm && findTrainersBtn && planOutputSection) {
    planForm.addEventListener('submit', () => {
        setTimeout(() => {
            // Check if the plan output section is visible and doesn't contain an error message in the first part
            const isVisible = planOutputSection.style.display === 'block';
            const hasError = nutritionPlanEl && nutritionPlanEl.innerHTML.includes('<strong>Error:</strong>');
            if (isVisible && !hasError) {
                findTrainersBtn.style.display = 'block';
            } else {
                 findTrainersBtn.style.display = 'none';
            }
        }, 100);
    });
}
