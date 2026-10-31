git pull
podman build -t localhost/pvg-bot:latest .
podman kube play --replace pod.yaml
