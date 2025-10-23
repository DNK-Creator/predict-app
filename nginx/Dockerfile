FROM nginx:stable-alpine

# Create necessary directories with proper permissions
RUN mkdir -p /var/cache/nginx/client_temp && \
    chown -R nginx:nginx /var/cache/nginx && \
    chmod -R 755 /var/cache/nginx

# Copy your custom config
COPY nginx.conf /etc/nginx/nginx.conf