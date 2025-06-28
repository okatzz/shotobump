#!/bin/bash

# ============================================================================
# SHOTOBUMP DATABASE RESET UTILITY
# ============================================================================
# This script helps you easily reset your Supabase database
# Usage: ./db-reset.sh [option]
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to show help
show_help() {
    echo -e "${BLUE}🎵 Shotobump Database Reset Utility${NC}"
    echo ""
    echo "Usage: ./db-reset.sh [option]"
    echo ""
    echo "Options:"
    echo "  full        - Complete database recreation (⚠️  DELETES ALL DATA)"
    echo "  data        - Reset test data only (keeps table structure)"
    echo "  help        - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./db-reset.sh full     # Complete reset"
    echo "  ./db-reset.sh data     # Data only reset"
    echo ""
    echo "Requirements:"
    echo "  - Supabase CLI installed (npm install -g supabase)"
    echo "  - Supabase project linked (supabase link)"
    echo "  - Or manually copy SQL to Supabase dashboard"
}

# Function to check if file exists
check_file() {
    if [ ! -f "$1" ]; then
        print_error "File $1 not found!"
        echo "Make sure you're running this script from the Shotobump directory."
        exit 1
    fi
}

# Function to run SQL file
run_sql() {
    local sql_file=$1
    local description=$2
    
    print_info "Running $description..."
    
    # Check if Supabase CLI is available
    if command -v supabase &> /dev/null; then
        print_info "Using Supabase CLI..."
        if supabase db reset --db-url "$SUPABASE_DB_URL" < "$sql_file"; then
            print_status "$description completed successfully!"
        else
            print_warning "Supabase CLI failed. Please run the SQL manually:"
            print_info "1. Go to your Supabase dashboard"
            print_info "2. Open SQL Editor"
            print_info "3. Copy and paste the contents of: $sql_file"
            print_info "4. Click 'Run'"
        fi
    else
        print_warning "Supabase CLI not found. Manual steps required:"
        echo ""
        print_info "1. Go to your Supabase dashboard: https://supabase.com/dashboard"
        print_info "2. Select your project"
        print_info "3. Go to SQL Editor"
        print_info "4. Copy and paste the contents of: $sql_file"
        print_info "5. Click 'Run'"
        echo ""
        print_info "Opening file for you to copy..."
        if command -v cat &> /dev/null; then
            echo ""
            echo "--- SQL FILE CONTENTS ---"
            cat "$sql_file"
            echo ""
            echo "--- END SQL FILE ---"
        fi
    fi
}

# Main script logic
case "${1:-help}" in
    "full")
        echo -e "${RED}⚠️  WARNING: This will DELETE ALL DATA in your database!${NC}"
        echo -n "Are you sure you want to continue? (yes/no): "
        read -r confirm
        
        if [ "$confirm" = "yes" ]; then
            check_file "recreate-database.sql"
            run_sql "recreate-database.sql" "complete database recreation"
        else
            print_info "Operation cancelled."
            exit 0
        fi
        ;;
    
    "data")
        print_warning "This will reset all test data but keep table structure."
        echo -n "Continue? (yes/no): "
        read -r confirm
        
        if [ "$confirm" = "yes" ]; then
            check_file "reset-data-only.sql"
            run_sql "reset-data-only.sql" "data reset"
        else
            print_info "Operation cancelled."
            exit 0
        fi
        ;;
    
    "help"|"--help"|"-h")
        show_help
        ;;
    
    *)
        print_error "Unknown option: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
print_status "Database operation completed!"
print_info "Your Shotobump app should now work with fresh data."
echo ""
print_info "Next steps:"
echo "  1. Make sure your .env file has correct Supabase credentials"
echo "  2. Run: cd Shotobump && npm start"
echo "  3. Test room creation and joining" 