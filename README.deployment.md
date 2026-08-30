# MediFlow Backend Deployment Guide

This guide outlines the standard operating procedure for deploying the MediFlow application stack to a production environment using Docker Compose.

## 1. Clone the Repository
Clone the repository and ensure you are on the `main` branch, which contains the latest production-ready code.

```bash
git clone <repository_url>
cd MDF
git checkout main
```

## 2. Configure Environment Variables
Copy the production environment example file and populate it with your production secrets, database credentials, and API keys.

```bash
cp .env.production.example .env
nano .env
```
*(Ensure `DEBUG=False` is set in your production `.env`)*

## 3. Spin up the Containers
Use Docker Compose to build and run the services in detached mode. The aggressively optimized `.dockerignore` files ensure only essential code is transferred to the Docker daemon.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 4. Run Initial Database Migrations
Once the `web` container is running and the PostgreSQL database is ready, apply the Django migrations to construct the production schema.

```bash
docker compose exec web python manage.py migrate
```

## 5. Create Initial Superuser
Generate the primary administrative account to access the Django Admin panel and configure the initial outlets.

```bash
docker compose exec web python manage.py createsuperuser
```

---
*Note: If you encounter issues during deployment, refer to the container logs using `docker compose logs -f web`.*
