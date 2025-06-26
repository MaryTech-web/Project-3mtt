document.addEventListener('DOMContentLoaded', () => {
    // Get references to DOM elements
    const taskInput = document.getElementById('taskInput');
    const taskDateInput = document.getElementById('taskDate'); // Crucial for AI display
    const taskTimeInput = document.getElementById('taskTime'); // Crucial for AI display
    const addTaskButton = document.getElementById('addTaskButton');
    const taskList = document.getElementById('taskList');
    const clearCompletedButton = document.getElementById('clearCompletedButton');

    let audio; // Declare audio variable for alarms (ensure you have a 'sounds/alarm-sound.mp3' file)

    // --- Alarm Related Variables ---
    const ALARM_CHECK_INTERVAL = 1000 * 5; // Check every 5 seconds
    let alarmCheckIntervalId; // To store the interval ID for clearing
    const triggeredAlarms = new Set(); // To prevent re-triggering the same alarm

    // Load tasks from local storage when the page loads
    loadTasks();

    // Start the alarm checker
    startAlarmChecker();

    // Request Notification permission (good practice to do early)
    if ('Notification' in window) {
        Notification.requestPermission();
    }

    // Event listener for adding a new task
    addTaskButton.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            addTask();
        }
    });

    // Event listener for managing clicks on the task list (delegation)
    taskList.addEventListener('click', manageTask);

    // Event listener for clearing completed tasks
    clearCompletedButton.addEventListener('click', clearCompletedTasks);

    /**
     * Adds a new task to the list.
     * This function now incorporates the NLP for smart date/time parsing.
     */
    function addTask() {
        let taskText = taskInput.value.trim();
        let taskDate = taskDateInput.value; // Get manually entered date (if any)
        let taskTime = taskTimeInput.value; // Get manually entered time (if any)

        if (taskText === '') {
            alert('Please enter a task!');
            return;
        }

        // --- AI (NLP) IN ACTION: Parsing Date/Time from Task Text ---
        // Only run NLP if the user hasn't manually filled the date/time fields.
        if (!taskDate && !taskTime) {
            const parsed = parseDateTimeFromTaskText(taskText); // Call the NLP function

            if (parsed.date || parsed.time) { // If NLP successfully parsed anything
                taskText = parsed.cleanText; // Use the text without date/time phrases
                taskDate = parsed.date;       // Use the date parsed by NLP
                taskTime = parsed.time;       // Use the time parsed by NLP

                // *********** THIS IS HOW THE "AI IN ACTION" IS SHOWN VISUALLY ***********
                // Update the actual HTML input fields so the user sees the automatic parsing.
                taskDateInput.value = taskDate;
                taskTimeInput.value = taskTime;
                // *************************************************************************
            }
        }
        // --- END AI (NLP) INTEGRATION ---

        const taskId = `task-${Date.now()}`;
        createTaskElement(taskText, taskDate, taskTime, false, taskId);
        saveTasks(); // Save tasks to local storage

        // Clear input fields for the next task entry
        taskInput.value = '';
        taskDateInput.value = '';
        taskTimeInput.value = '';
    }

    /**
     * Creates and appends a new task list item to the DOM.
     * Includes logic to format and display date/time.
     */
    function createTaskElement(text, date, time, isCompleted, id) {
        const listItem = document.createElement('li');
        listItem.dataset.taskId = id; // Store the unique ID
        listItem.dataset.taskDate = date; // Store original parsed date
        listItem.dataset.taskTime = time; // Store original parsed time

        if (isCompleted) {
            listItem.classList.add('completed');
        }

        const taskTextSpan = document.createElement('span');
        taskTextSpan.classList.add('task-text');
        taskTextSpan.textContent = text;
        listItem.appendChild(taskTextSpan);

        const taskMeta = document.createElement('div');
        taskMeta.classList.add('task-meta');
        listItem.appendChild(taskMeta);

        const dateTimeSpan = document.createElement('span');
        dateTimeSpan.classList.add('task-datetime');
        let displayDateTime = '';
        if (date) {
            try {
                // Handle cases where date might be MM-DD or relative
                let dateToParse = date;
                // If the date string doesn't include the year, assume current year
                if (date.match(/^\d{2}-\d{2}$/)) { // Checks for MM-DD format
                    dateToParse = `${new Date().getFullYear()}-${date}`;
                }
                const dateObj = new Date(`${dateToParse}T00:00:00`);
                // Use 'en-US' locale as a default, you can change this
                displayDateTime += dateObj.toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                });
            } catch (e) {
                console.error("Error parsing date for display:", date, e);
                displayDateTime += date; // Fallback to raw date string
            }
        }
        if (time) {
            if (displayDateTime) displayDateTime += ' at ';
            try {
                // Use a dummy date (Jan 1, 2000) to parse just the time correctly
                const timeObj = new Date(`2000-01-01T${time}`);
                displayDateTime += timeObj.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: 'numeric', hour12: true
                });
            } catch (e) {
                console.error("Error parsing time for display:", time, e);
                displayDateTime += time; // Fallback to raw time string
            }
        }
        dateTimeSpan.textContent = displayDateTime;
        taskMeta.appendChild(dateTimeSpan);

        const deleteButton = document.createElement('button');
        deleteButton.classList.add('delete-button');
        deleteButton.textContent = 'Delete';
        taskMeta.appendChild(deleteButton);

        taskList.appendChild(listItem);
    }

    /**
     * Handles clicks on task items (toggling completion or deleting).
     */
    function manageTask(event) {
        const clickedElement = event.target;
        const listItem = clickedElement.closest('li'); // Find the closest <li> ancestor

        if (!listItem) { // If click wasn't inside a list item, do nothing
            return;
        }

        if (clickedElement.classList.contains('task-text')) {
            listItem.classList.toggle('completed');
            saveTasks();
            // If task is uncompleted, allow its alarm to potentially trigger again
            if (!listItem.classList.contains('completed')) {
                triggeredAlarms.delete(listItem.dataset.taskId);
            }
        } else if (clickedElement.classList.contains('delete-button')) {
            const taskId = listItem.dataset.taskId;
            listItem.remove(); // Remove from DOM
            saveTasks(); // Update local storage
            triggeredAlarms.delete(taskId); // Remove from triggered alarms set
        }
    }

    /**
     * Clears all tasks that are marked as completed.
     */
    function clearCompletedTasks() {
        const completedTasks = taskList.querySelectorAll('.completed');
        completedTasks.forEach(task => {
            const taskId = task.dataset.taskId;
            task.remove();
            triggeredAlarms.delete(taskId); // Ensure alarm ID is also cleared
        });
        saveTasks();
    }

    /**
     * Saves the current tasks to Local Storage.
     */
    function saveTasks() {
        const tasks = [];
        taskList.querySelectorAll('li').forEach(listItem => {
            const id = listItem.dataset.taskId;
            const text = listItem.querySelector('.task-text').textContent;
            const date = listItem.dataset.taskDate || ''; // Retrieve stored date
            const time = listItem.dataset.taskTime || ''; // Retrieve stored time
            const completed = listItem.classList.contains('completed');
            tasks.push({ id: id, text: text, date: date, time: time, completed: completed });
        });
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    /**
     * Loads tasks from Local Storage and renders them on the page.
     */
    function loadTasks() {
        const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
        tasks.forEach(task => {
            createTaskElement(task.text, task.date, task.time, task.completed, task.id);
        });
    }

    // --- Alarm Logic Functions ---
    function startAlarmChecker() {
        // Clear any existing interval to prevent duplicates if function is called again
        if (alarmCheckIntervalId) {
            clearInterval(alarmCheckIntervalId);
        }
        alarmCheckIntervalId = setInterval(checkAlarms, ALARM_CHECK_INTERVAL);
    }

    function checkAlarms() {
        const now = new Date();

        taskList.querySelectorAll('li:not(.completed)').forEach(listItem => {
            const taskId = listItem.dataset.taskId;
            const taskDate = listItem.dataset.taskDate;
            const taskTime = listItem.dataset.taskTime;
            const taskText = listItem.querySelector('.task-text').textContent;

            // Only check if both date and time are set for the task
            if (taskDate && taskTime) {
                // Create a Date object for the task's due time
                const dueDateTime = new Date(`${taskDate}T${taskTime}:00`);

                // If current time is past or at due time, and alarm hasn't been triggered for this task yet
                if (now >= dueDateTime && !triggeredAlarms.has(taskId)) {
                    triggerAlarm(taskId, taskText);
                }
            }
        });
    }

    function triggerAlarm(taskId, taskText) {
        triggeredAlarms.add(taskId); // Mark this alarm as triggered

        // 1. Play sound
        // Ensure you have an 'alarm-sound.mp3' file in a 'sounds' directory
        if (!audio) {
            audio = new Audio('sounds/alarm-sound.mp3');
            audio.loop = false; // Play once
        }
        audio.play().catch(e => console.error("Error playing alarm sound:", e));

        // 2. Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notificationOptions = {
                body: `Your task "${taskText}" is due!`,
                icon: 'images/icon.png' // Make sure you have an icon image (e.g., 96x96px)
            };
            new Notification('To-Do List Reminder', notificationOptions);
        } else if ('Notification' in window && Notification.permission === 'default') {
            // Ask for permission if not yet granted/denied
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification('To-Do List Reminder', { body: `Your task "${taskText}" is due!` });
                }
            });
        } else {
            // Fallback for browsers without Notification API or if permission is denied
            alert(`ALARM! Your task "${taskText}" is due!`);
        }

        // 3. Optional: Add a visual highlight animation to the task
        const listItem = document.querySelector(`li[data-task-id="${taskId}"]`);
        if (listItem && !listItem.classList.contains('completed')) {
            listItem.style.animation = 'blink 1s infinite'; // Requires 'blink' keyframes in CSS
        }
    }


    /**
     * ***** THE NATURAL LANGUAGE PROCESSING (NLP) "AI" FUNCTION *****
     * Parses natural language phrases for date and time from the task text.
     * This is the "AI" part that understands human-like input like "tomorrow", "next Monday", "at 3pm".
     * @param {string} text - The full task text entered by the user.
     * @returns {object} An object containing the parsed date (YYYY-MM-DD), time (HH:MM), and the cleaned task text.
     */
    function parseDateTimeFromTaskText(text) {
        let date = '';
        let time = '';
        let cleanText = text; // This will become the task text without date/time phrases

        const now = new Date(); // Get current date and time
        // Calculate 'today' at the start of the day (to avoid time-of-day influencing date)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Calculate 'tomorrow' based on 'today'
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1); // This correctly sets it to the next day

        // Regular expressions for common date/time phrases
        const patterns = {
            // Example: "at 5pm", "8am", "noon", "14:30"
            time: /(?:at\s)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight|(\d{1,2}:\d{2}))/i,
            // Example: "today", "tomorrow", "next Monday", "on Friday", "in 3 days"
            date: /(today|tomorrow|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+(\d+)\s+days?)/i
        };

        // 1. Attempt to extract Time first (helps avoid confusion if a date phrase contains numbers that look like time)
        const timeMatch = cleanText.match(patterns.time);
        if (timeMatch && timeMatch[1]) {
            let extractedTime = timeMatch[1].toLowerCase();
            if (extractedTime === 'noon') {
                time = '12:00';
            } else if (extractedTime === 'midnight') {
                time = '00:00';
            } else {
                let [hr, min] = extractedTime.replace(/(am|pm)/i, '').split(':').map(Number);
                let ampm = extractedTime.match(/(am|pm)/i);

                if (ampm) {
                    ampm = ampm[0].toLowerCase();
                    if (ampm === 'pm' && hr < 12) hr += 12; // Convert PM hours to 24-hour format
                    if (ampm === 'am' && hr === 12) hr = 0; // 12 AM (midnight) is 00:00 in 24-hour
                }

                time = `${String(hr).padStart(2, '0')}:${String(min || 0).padStart(2, '0')}`; // Format to HH:MM
            }
            // Remove the matched time phrase from the text so it's not part of the final task text
            cleanText = cleanText.replace(timeMatch[0], '').trim();
        }

        // 2. Attempt to extract Date
        const dateMatch = cleanText.match(patterns.date);
        if (dateMatch) {
            const extractedPhrase = dateMatch[0].toLowerCase(); // The full matched phrase (e.g., "tomorrow")
            const valueMatch = dateMatch[1].toLowerCase();     // The specific keyword group (e.g., "tomorrow", "next monday")

            if (valueMatch.includes('today')) {
                date = today.toISOString().split('T')[0]; // Convert date object to YYYY-MM-DD string
            } else if (valueMatch.includes('tomorrow')) {
                date = tomorrow.toISOString().split('T')[0]; // Convert 'tomorrow' date object to YYYY-MM-DD string
            } else if (valueMatch.includes('next ')) {
                const dayOfWeekStr = valueMatch.replace('next ', '').trim();
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                let dayIndex = days.indexOf(dayOfWeekStr); // Get numerical day of week (0 for Sunday, 1 for Monday, etc.)

                if (dayIndex !== -1) { // If a valid day of the week was found
                    let currentDayIndex = now.getDay();
                    let diff = dayIndex - currentDayIndex;
                    if (diff <= 0) diff += 7; // If target day is today or in the past this week, jump to next week
                    const targetDate = new Date(now);
                    targetDate.setDate(now.getDate() + diff); // Calculate the specific date
                    date = targetDate.toISOString().split('T')[0];
                }
            } else if (valueMatch.includes('on ')) { // Handles phrases like "on Monday"
                const dayOfWeekStr = valueMatch.replace('on ', '').trim();
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                let dayIndex = days.indexOf(dayOfWeekStr);

                if (dayIndex !== -1) {
                    let currentDayIndex = now.getDay();
                    let diff = dayIndex - currentDayIndex;
                    if (diff < 0) diff += 7; // If target day is in the past this week, go to next week
                    const targetDate = new Date(now);
                    targetDate.setDate(now.getDate() + diff);
                    date = targetDate.toISOString().split('T')[0];
                }
            } else if (valueMatch.startsWith('in ')) { // Handles phrases like "in 3 days"
                const numDays = parseInt(dateMatch[4]); // dateMatch[4] captures the number from the regex group
                if (!isNaN(numDays)) {
                    const targetDate = new Date(now);
                    targetDate.setDate(now.getDate() + numDays);
                    date = targetDate.toISOString().split('T')[0];
                }
            }
            cleanText = cleanText.replace(dateMatch[0], '').trim();
        }

        return {
            date: date,
            time: time,
            cleanText: cleanText // The task text after date/time phrases are removed
        };
    }
}); // End of DOMContentLoaded listener
