# Habit Tracker

A browser-based habit tracking web application built with vanilla HTML, CSS, and JavaScript.  
The app helps users build consistency by tracking daily habits, streaks, and weekly goals, all stored locally in the browser.

## Features

- Add and manage multiple habits
- Daily streak tracking with best-streak history
- Flexible scheduling:
  - Daily
  - Mon / Wed / Fri
  - Tue / Thu
  - Weekly target
- Goal-based progress tracking
- Customizable day rollover time (useful for late-night schedules)
- Light theme customization with multiple color presets
- Undo support for recent actions
- Persistent storage using `localStorage` (no backend required)

## Tech Stack

- **HTML** for structure
- **CSS** for styling and responsive layout
- **JavaScript (Vanilla)** for application logic and state management
- **Browser Local Storage** for data persistence

No external frameworks or libraries are used.

## How It Works

- All habit data is saved locally in the user's browser using `localStorage`
- Each habit tracks completed days, streaks, and optional goals
- The app recalculates streaks and weekly progress dynamically
- Themes are applied using CSS variables controlled by JavaScript

## Running the Project

No setup required.

1. Clone or download the repository
2. Open `index.html` in any modern web browser

## Purpose

This project was built as a personal learning exercise to:
- Practice frontend fundamentals without frameworks
- Work with state management in plain JavaScript
- Design clean UI interactions
- Build a complete, usable application from scratch

## Future Improvements

- Cloud sync or account-based storage
- Export/import habit data
- Mobile-first enhancements
- Accessibility improvements

---
