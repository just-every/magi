#!/bin/bash

# Helper function to add simple boilerplate code

add_boilerplate_code() {
    local project_type=$1
    local backend_app_name=$2
    local frontend_app_name=$3 # Note: This is the actual generated frontend/game app name

    echo "Adding simple boilerplate code..."

    # Add backend /ping endpoint (only if backend app exists)
    if [[ "$project_type" == "web-saas" ]]; then
        local api_controller_path="${backend_app_name}/src/app/app.controller.ts"
        echo "Overwriting ${api_controller_path} with ping endpoint..."
        # Ensure AppService is correctly imported based on default generation
        cat << EOF > "${api_controller_path}"
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service'; // Assuming AppService exists

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    // Keep the default hello world from the service
    return this.appService.getHello();
  }

  @Get('ping')
  getPing(): { message: string } {
    console.log('Received request at /ping'); // Add console log
    return { message: 'pong' };
  }
}
EOF
        if [ $? -ne 0 ]; then
            echo "Error creating backend controller boilerplate."
            return 1
        fi
    fi

    # Add frontend fetch example (if a frontend app was generated)
    if [ -n "$frontend_app_name" ]; then
        # For debugging purposes
        echo "Frontend app name: $frontend_app_name"

        # Hard-code the value for now to fix the path generation
        if [[ "$project_type" == "web-frontend" ]]; then
            frontend_app_name="web"
        fi

        local app_tsx_path="${frontend_app_name}/src/app/app.tsx"
        echo "Overwriting frontend app at path: ${app_tsx_path}"

        if [ ! -f "${app_tsx_path}" ]; then
            echo "WARNING: App file ${app_tsx_path} does not exist. Creating anyway."
        fi

        cat > "${app_tsx_path}" << EOF
import React, { useState, useEffect } from 'react';
import './app.css'; // Assuming default CSS import exists

export function App() {
  const [message, setMessage] = useState('Loading ping...');
  const [hello, setHello] = useState('Loading hello...');

  useEffect(() => {
    // Fetch from /ping (adjust URL/port if backend runs differently)
    // Default NestJS port is 3000. Only fetch if backend exists.
    if ("${project_type}" === "web-saas") {
        fetch('http://localhost:3000/ping')
          .then(async (res) => {
              if (!res.ok) {
                  const text = await res.text();
                  throw new Error(\`Ping request failed: \${res.status} \${res.statusText} - \${text}\`);
              }
              return res.json();
          })
          .then((data) => setMessage(data.message))
          .catch((error) => {
              console.error("Ping fetch error:", error);
              setMessage(\`Error: \${error.message}\`);
          });

        // Fetch from default / endpoint
         fetch('http://localhost:3000/')
          .then(async (res) => {
               if (!res.ok) {
                  const text = await res.text();
                  throw new Error(\`Hello request failed: \${res.status} \${res.statusText} - \${text}\`);
              }
              // Assuming the default endpoint returns plain text
              return res.text();
          })
          .then((data) => setHello(data))
          .catch((error) => {
              console.error("Hello fetch error:", error);
              setHello(\`Error: \${error.message}\`);
          });
    } else {
        setMessage("N/A (No backend)");
        setHello("N/A (No backend)");
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div style={{ padding: '20px' }}>
      <h1>Welcome to ${frontend_app_name}!</h1>
      <p>Backend Ping Status: <strong>{message}</strong></p>
      <p>Backend Hello Status: <strong>{hello}</strong></p>
      <p>Check browser console and backend console (if applicable) for fetch errors or logs.</p>
    </div>
  );
}

export default App;
EOF
        if [ $? -ne 0 ]; then
            echo "Error creating frontend app boilerplate."
            return 1
        fi

        echo "Successfully wrote boilerplate to ${app_tsx_path}"
    fi

    return 0 # Success
}
