# LogLLM — Kubernetes Deployment

## Prerequisites
- minikube or any k8s cluster
- kubectl
- Docker Hub account (to push images)

## 1. Build & push Docker images

```bash
# Backend
docker build -t YOUR_DOCKERHUB_USERNAME/logllm-backend:latest ./backend
docker push YOUR_DOCKERHUB_USERNAME/logllm-backend:latest

# Frontend
docker build -t YOUR_DOCKERHUB_USERNAME/logllm-frontend:latest ./frontend
docker push YOUR_DOCKERHUB_USERNAME/logllm-frontend:latest
```

## 2. Edit secrets

Fill in your API keys in `k8s/secret.yaml`, then:

```bash
# Never commit secret.yaml with real keys — use kubectl apply locally only
```

## 3. Deploy (one command)

```bash
kubectl apply -f k8s/
```

This applies all manifests in order: namespace → secrets → mongo → redis → backend → frontend → ingress.

## 4. Access the app (minikube)

```bash
minikube addons enable ingress
echo "$(minikube ip) logllm.local" | sudo tee -a /etc/hosts
# Open http://logllm.local
```

## 5. Useful commands

```bash
# Check everything running
kubectl get all -n logllm

# View backend logs
kubectl logs -n logllm deploy/backend -f

# Restart backend
kubectl rollout restart -n logllm deploy/backend
```
