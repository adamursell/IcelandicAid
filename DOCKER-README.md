# Docker Setup for Icelandic Learning Aid

This document explains how to set up and run the application using Docker for local development.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed on your system
- [Docker Compose](https://docs.docker.com/compose/install/) (included with Docker Desktop for Windows/Mac)

## Getting Started

### 1. Environment Variables

Create a `.env` file in the project root by copying the example file:

```bash
cp .env.example .env
```

Update the values in `.env` with your actual API keys and preferred settings.

### 2. Build and Start the Containers

From the project root, run:

```bash
docker-compose up --build
```

This will:
- Build the Docker images for frontend and backend
- Start the PostgreSQL database
- Set up the network between the containers
- Mount the local directories to the containers for live code updates

### 3. Access the Application

Once the containers are running:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### 4. Development Workflow

- Changes to the frontend and backend code will automatically reload in development mode
- The database data is persisted in a Docker volume
- You can interact with the database directly through port 5432

### 5. Stopping the Containers

To stop the containers, press `Ctrl+C` in the terminal, or run:

```bash
docker-compose down
```

To completely remove the containers, networks, and volumes:

```bash
docker-compose down -v
```

### 6. Database Management

#### Initialize the Database
The first time you run the application, the database schema will be automatically created.

#### Accessing the Database
You can connect to the PostgreSQL database using any PostgreSQL client with these credentials:
- Host: localhost
- Port: 5432
- Username: postgres
- Password: postgres
- Database: icelandic_aid_db

## Troubleshooting

### Frontend Can't Connect to Backend
- Ensure the REACT_APP_API_URL is set correctly in the docker-compose.yml
- Verify that both containers are running with `docker-compose ps`

### Database Connection Issues
- Check if the PostgreSQL container is running
- Verify that the database credentials in the backend environment match the PostgreSQL container setup

### Container Won't Start
- Check the logs with `docker-compose logs [service_name]`
- Ensure all required environment variables are set

## Deploying to Production (Render)

When you're ready to deploy to Render:

1. Push your changes to GitHub
2. Render will automatically build and deploy based on your render.yaml configuration
3. The environment variables in Render should match your production settings, not the local Docker ones

Note: You don't need to modify your code when deploying to Render since the environment variables are managed in the Render dashboard. 