# Use an official Node.js runtime as the base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install application dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

EXPOSE 8000

# Define the command to run your application
CMD ["node", "main.js"]