# Use an official Node.js runtime as the base image
FROM node:20-alpine as build

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

RUN npm run build

FROM nginx:stable-alpine

COPY --from=build /dist /usr/share/nginx/html
COPY --from=build nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

# Define the command to run your application
CMD [ "nginx", "-g", "daemon off;" ]