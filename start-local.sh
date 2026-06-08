#!/bin/bash

# Ensure we are in the script's directory
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Copying .env.example to .env..."
        cp .env.example .env
        echo "Please ensure you update .env with your GROQ_API_KEY and Supabase keys before testing."
    else
        echo "Warning: .env and .env.example not found."
    fi
fi

echo "Installing dependencies..."
bun install

echo "Starting local development server..."
bun run dev
