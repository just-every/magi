# Shared PostgreSQL Database

This project uses a shared PostgreSQL database container that can be accessed by all services and applications within the magi-system. This approach simplifies database management and avoids port conflicts that would occur if each project had its own database container.

## Starting the Database

To start the shared PostgreSQL database:

```bash
# From the magi-system root directory
docker compose up -d db
```

The database will be accessible at:

- **From containers**: `db:5432` (service name in Docker network)
- **From host**: `localhost:5432`

## Connection Details

Default connection parameters (defined in `.env.example`):

```
DATABASE_HOST=db        # Use 'db' inside containers, 'localhost' on host
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=postgres
```

Copy `.env.example` to `.env` and modify these values if needed.

## Connecting from Applications

### Within Docker Containers

Services running in containers should use `db` as the hostname:

```javascript
const dbConfig = {
    host: process.env.DATABASE_HOST || 'db',
    port: process.env.DATABASE_PORT || 5432,
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'postgres',
};
```

### From Host Applications

Applications running directly on your host should use `localhost`:

```javascript
const dbConfig = {
    host: 'localhost',
    port: 5432,
    // other parameters as above
};
```

### Using with Prisma

Nx workspaces generated with the templates will use `DATABASE_URL` built from environment variables. Example from a project's `.env` file:

```
DATABASE_URL="postgresql://${DATABASE_USER:-postgres}:${DATABASE_PASSWORD:-postgres}@${DATABASE_HOST:-db}:${DATABASE_PORT:-5432}/${DATABASE_NAME:-postgres}?schema=public"
```

## Generated Projects

### New Projects

Projects generated with the `setup_project.sh` script will automatically use the shared database if it exists.

### Existing Projects

Previously generated projects have their own `docker-compose.yml` with a PostgreSQL service. To avoid port conflicts, the port mapping has been changed to `5433:5432` (or commented out). To update these projects to use the shared database:

1. Update the project's `.env` file to use the same database credentials as the shared database
2. Modify the database connection string to use the shared database host/port
