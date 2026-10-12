# --- Stage 1: build the React app ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time env vars — CRA bakes REACT_APP_* vars into the JS bundle at
# build time, not runtime, so they must be passed as build args, not
# regular container env vars set later.
ARG REACT_APP_API_URL
ARG REACT_APP_RAZORPAY_KEY_ID
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_RAZORPAY_KEY_ID=$REACT_APP_RAZORPAY_KEY_ID

RUN npm run build

# --- Stage 2: serve the static build with nginx ---
FROM nginx:1.27-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
