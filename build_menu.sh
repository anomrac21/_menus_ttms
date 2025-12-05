#!/bin/bash

# CRITICAL: Configure Git to use HTTPS for GitHub URLs (prevents SSH fallback)
# This is essential for Netlify builds which don't have SSH keys
# Configure both global and local Git settings
git config --global url.https://github.com/.insteadOf git@github.com:
git config --global url.https://github.com/.insteadOf ssh://git@github.com/
git config url.https://github.com/.insteadOf git@github.com:
git config url.https://github.com/.insteadOf ssh://git@github.com/

# Add GitHub to known_hosts to prevent SSH host key verification errors
# This is needed because Netlify's "preparing repo" stage may try SSH before our script runs
mkdir -p ~/.ssh
ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null || true

# Sync submodule URLs from .gitmodules to ensure HTTPS URLs are used
git submodule sync --recursive

# Initialize submodules with HTTPS URLs
git submodule update --init --recursive 

# Update submodules to latest master branch to ensure latest theme changes are included
echo "Updating submodules to latest master branch..."
cd themes/_menus_ttms
git fetch origin master
git checkout master
git pull origin master
cd ../..

# Build the Hugo site with optimization
echo "Running Hugo build with minification..."
hugo --gc --minify

echo "✅ Build completed successfully!"
