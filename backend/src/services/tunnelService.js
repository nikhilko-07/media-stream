import localtunnel from 'localtunnel';
import https from 'https';

class TunnelService {
  constructor() {
    this.tunnel = null;
    this.status = 'OFFLINE';
    this.url = null;
    this.password = null;
    this.customDomain = process.env.CUSTOM_DOMAIN || 'https://stream.nikhilkohli.com';
  }

  async getPublicIp() {
    return new Promise((resolve) => {
      https.get('https://loca.lt/mytunnelpassword', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data.trim()));
      }).on('error', () => resolve(''));
    });
  }

  async startTunnel(port = 9086) {
    if (this.tunnel && this.status === 'ONLINE') {
      return { status: this.status, url: this.url, password: this.password };
    }

    try {
      this.password = await this.getPublicIp();
      this.tunnel = await localtunnel({ port });
      this.status = 'ONLINE';
      this.url = this.tunnel.url;

      this.tunnel.on('close', () => {
        this.status = 'OFFLINE';
        this.url = null;
        this.tunnel = null;
      });

      this.tunnel.on('error', (err) => {
        console.error('[Tunnel Error]:', err);
        this.status = 'OFFLINE';
        this.url = null;
      });

      console.log(`[Tunnel] Online tunnel started: ${this.url}`);
      return { status: this.status, url: this.url, password: this.password };
    } catch (err) {
      this.status = 'ERROR';
      throw err;
    }
  }

  async stopTunnel() {
    if (this.tunnel) {
      await this.tunnel.close();
      this.tunnel = null;
    }
    this.status = 'OFFLINE';
    this.url = null;
    return { status: this.status };
  }

  getStatus() {
    return {
      status: this.status,
      tunnelUrl: this.url,
      tunnelPassword: this.password,
      customDomain: this.customDomain
    };
  }
}

export const tunnelService = new TunnelService();
