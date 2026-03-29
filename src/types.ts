export interface ContainerUser {
  username: string;
}

export interface UserCredentials {
  username: string;
  password: string;
  isSudoer: boolean;
}

export interface StartContainerRequest {
  gameId: string;
  image: string;
  users?: ContainerUser[];
  env: Record<string, string>;
}

export interface StartContainerResponse {
  containerId: string;
  virtualIp: string;
  sshPort: number;
  httpPort: number;
  users?: UserCredentials[];
}

export interface StopContainerRequest {
  containerId: string;
}

export interface ContainerMapping {
  id: number;
  container_id: string;
  virtual_ip: string;
  host: string;
  ssh_port: number;
  http_port: number;
  game_id: string | null;
  created_at: string;
}
