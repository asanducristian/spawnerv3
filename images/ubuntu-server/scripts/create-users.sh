#!/bin/bash
set -euo pipefail
[ -z "${USERS:-}" ] && exit 0
echo "$USERS" | jq -c '.[]' | while read -r user; do
  username=$(echo "$user" | jq -r '.username')
  password=$(echo "$user" | jq -r '.password')
  is_sudoer=$(echo "$user" | jq -r '.isSudoer')
  id "$username" >/dev/null 2>&1 || useradd -m -s /bin/bash "$username"
  echo "$username:$password" | chpasswd
  usermod -U "$username" 2>/dev/null || true
  mkdir -p "/home/$username/.ssh"
  chown "$username:$username" "/home/$username/.ssh"
  chmod 700 "/home/$username/.ssh"
  if [ "$is_sudoer" = "true" ]; then
    echo "$username ALL=(ALL) ALL" > "/etc/sudoers.d/$username"
    chmod 440 "/etc/sudoers.d/$username"
    echo "Created sudoer: $username"
  else
    echo "Created user: $username"
  fi
done
