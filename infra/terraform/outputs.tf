output "instance_id" {
  value = aws_instance.engine.id
}

output "public_ip" {
  value = aws_instance.engine.public_ip
}

output "public_dns" {
  value = aws_instance.engine.public_dns
}

# Drop these into server/.env.server (use https + a reverse proxy / ALB in prod;
# raw http shown here for first-boot testing).
output "engine_env_for_app" {
  description = "Values to set in server/.env.server"
  value = {
    ENGINE_IMAGE_URL = "http://${aws_instance.engine.public_dns}:8001"
    ENGINE_VOICE_URL = "http://${aws_instance.engine.public_dns}:8002"
    ENGINE_VIDEO_URL = "http://${aws_instance.engine.public_dns}:8003"
    ENGINE_MUSIC_URL = "http://${aws_instance.engine.public_dns}:8004"
  }
}
