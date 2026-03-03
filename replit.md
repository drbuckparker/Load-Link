# LoadLink Mobile Companion App

## Overview
The LoadLink Mobile Companion App is designed to extend the functionality of the existing LoadLink logistics web platform to mobile devices. It serves all user roles within the short-haul trucking and construction industries, including truck drivers, contractors, trucking companies, and foremen. The app aims to streamline job management, communication, and financial tracking for all stakeholders, providing a comprehensive mobile solution for logistics operations.

## User Preferences
I want to prioritize a clean, maintainable, and well-structured codebase. I prefer clear and concise explanations for any proposed changes, focusing on the "why" as much as the "what." For development, I prefer an iterative approach, with small, testable changes. Please ask for confirmation before implementing major architectural changes or refactoring large portions of the codebase. When making changes, ensure that all existing features continue to function as expected, especially role-based access and UI elements.

## System Architecture

### Frontend
- **Framework**: React Native with Expo Router for file-based routing.
- **State Management**: React Query for server state synchronization and AuthContext for user authentication state.
- **Styling**: React Native StyleSheet, adhering to a dark "Industrial Modern" theme optimized for outdoor visibility.
- **UI/UX**:
    - **Color Scheme**: Primary Safety Orange (#FF9900) on Deep Asphalt (#161a22) background.
    - **Typography**: Chakra Petch for headings (bold, uppercase) and Inter for body text.
    - **Accessibility**: Minimum 44pt touch targets for gloved hands.
    - **Interactive Elements**: Liquid glass tab bar on iOS 26+ with BlurView fallback.
    - **Role-Aware UI**: Dynamic tab layouts and feature visibility based on user roles (e.g., contractors see job management/invoices; drivers see job browsing/earnings).

### Backend
- **Technology**: Express.js with Drizzle ORM.
- **Database Interaction**: Connects to an external Neon PostgreSQL database, sharing schema with the existing LoadLink web application.
- **Authentication**: Email/password authentication using bcrypt for password hashing and express-session for session management, with sessions stored in the database.
- **Core Features**:
    - **Job Management**: Drivers can browse, accept, clock-in/out, and track earnings. Contractors can post, manage assignments (approve/reject drivers), and view invoices.
    - **User Roles**: Supports `driver`, `contractor`, `trucking_company`, `trucking_company_contractor`, `driver_contractor`, `foreman`, `driver_trucking_company` with role-based feature access.
    - **Messaging**: Real-time messaging between users related to specific jobs, including auto-messages for job events.
    - **Review System**: Allows users to submit and view reviews for completed jobs, impacting user ratings.
    - **Vehicle Management**: Users can add, update, and delete their vehicles.
    - **Project Management**: Contractors can create, update, and manage projects, linking jobs to specific projects.
    - **Weight Ticket System**: Supports uploading weight tickets for job runs, with reminders and viewing capabilities.
    - **Location Services**: GPS tracking for clock-in/out, location-based job filtering using haversine formula, and integration with Google Places/Maps for location input and navigation.
    - **Push Notifications**: Utilizes Expo Push for critical updates such as new applications, message alerts, job status changes, and weight ticket reminders.

## External Dependencies
- **Database**: Neon PostgreSQL (`EXTERNAL_DATABASE_URL`).
- **Email Service**: Resend (for password reset emails, uses `RESEND_API_KEY`).
- **Mapping/Location Services**:
    - Google Places API (for autocomplete and details).
    - Google Maps JavaScript API (for web map view and directions).
    - React Native Maps (for native map view).
    - Native device map applications (iOS Maps / Android Geo) for external navigation.
- **Push Notification Service**: Expo Push API (exp.host).