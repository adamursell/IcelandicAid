#!/bin/bash
# Clean install of dependencies
npm ci

# Build the React app with CI=false to ignore warnings and some errors
CI=false npm run build 