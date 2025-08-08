#!/bin/bash

# Appointment Scheduler - Docker Setup Script
# This script starts the MySQL database and runs migrations

echo "🚀 Appointment Scheduler - Docker Setup"
echo "========================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running or you don't have permission."
    echo "Please start Docker or run with: sudo ./start-docker.sh"
    exit 1
fi

# Start MySQL container
echo "📦 Starting MySQL container..."
docker-compose up -d mysql

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to be ready..."
sleep 10

# Check if MySQL is running
if docker-compose ps | grep -q "appointment-scheduler-mysql.*Up"; then
    echo "✅ MySQL is running!"
else
    echo "❌ MySQL failed to start. Check logs with: docker-compose logs mysql"
    exit 1
fi

# Run migrations
echo "🔄 Running database migrations..."
npm run migrate

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully!"
else
    echo "⚠️  Migrations failed. The database might not be ready yet."
    echo "Try running 'npm run migrate' manually in a few seconds."
fi

# Optional: Run seeders
read -p "Would you like to seed the database with sample data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npm run seed
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Start the application: npm start"
echo "  2. Access the API at: http://localhost:3000/api"
echo "  3. View database at: http://localhost:8080 (Adminer)"
echo "     - Server: mysql"
echo "     - Username: appuser"
echo "     - Password: apppassword123"
echo "     - Database: appointment_scheduler"
echo ""
echo "🛑 To stop Docker containers: docker-compose down"
echo "🗑️  To remove all data: docker-compose down -v"