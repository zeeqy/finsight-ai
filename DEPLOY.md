# Putting FinSight AI online

The whole app runs on one server with Docker Compose:

```
internet ─▶ Caddy (HTTPS, ports 80/443) ─▶ app: Express + the built React app (:5000)
                                              ├─▶ mysql (MySQL 8.4, data on a Docker volume)
                                              └─▶ ml (FastAPI models, :8000, not public)
```

The same files work on the free server now and on a paid server later. Moving is: back up, set up the new server the same way, restore.

You do the account steps yourself (Oracle, DuckDNS, GitHub, Google AI Studio). Claude can prepare files but must not create accounts or type keys into websites.

---

## Before you go public (checklist)

- [ ] Your supervisor agrees to a public launch that collects real users' data (UiTM may have rules for this).
- [ ] `CONTACT_EMAIL` is set. It appears in the privacy notice and Terms of use.
- [ ] `DATA_LOCATION` is set (for example `Singapore (Oracle Cloud)`). PDPA asks you to say where data is kept.
- [ ] The Gemini key comes from a project **with billing turned on**. On the free tier Google may use requests to improve its products, and the advisor sends users' figures. Set a budget alert in Google Cloud so a spike cannot surprise you.
- [ ] The GitHub repository is **private**. It holds your code, your report evidence and a few merchant names from your own statement in `server/src/utils/categorizer.js`.
- [ ] Daily backups are on (step 7): encrypted, copied off the server, and you have restored one once to check it works.
- [ ] If you made the demo account (step 6), it has your own password, not the one in `seedDemo.js`.
- [ ] A free uptime monitor watches `https://YOUR-DOMAIN/api/health` (for example UptimeRobot).
- [ ] You know what to do if there is a data breach: take the site offline (`docker compose down`), find out what was exposed, tell the affected users and, under the PDPA (Amendment) Act 2024, the Personal Data Protection Commissioner.

---

## 1. A free server: Oracle Cloud "Always Free"

1. Sign up at oracle.com/cloud/free. It asks for a card to check you are a real person; Always Free resources are not charged.
2. Pick a home region close to Malaysia (Singapore). The home region cannot be changed later.
3. Create a compute instance:
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere A1 (ARM)**, 2 OCPU and 12 GB memory is plenty (Always Free allows up to 4 OCPU / 24 GB in total)
   - Add your SSH public key (`ssh-keygen -t ed25519` on your laptop if you do not have one)
   - If it says "out of capacity", try again later or pick another availability domain.
4. Open ports 80 and 443. Oracle has **two** firewalls, and both must allow them:
   - In the console: the instance's subnet → Security List → add Ingress rules for TCP 80 and TCP 443 from `0.0.0.0/0`.
   - On the server (Ubuntu images block them by default):
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
5. Note the instance's **public IP address**.

If Oracle does not work out, any server with 2 GB of memory or more and Docker works the same way (DigitalOcean, Hetzner, a university server).

## 2. A free address: DuckDNS

1. Sign in at duckdns.org and create a subdomain, for example `finsight-ai` → `finsight-ai.duckdns.org`.
2. Set its IP to the server's public IP.

HTTPS needs a name like this; Caddy gets the certificate for it automatically. A paid domain (about RM 50 a year for a `.com` or `.my`) can replace it later: point it at the server and change `DOMAIN`.

## 3. Install Docker on the server

```bash
ssh ubuntu@YOUR-SERVER-IP
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Sign in again so the group change applies.

## 4. Put the code on the server

On your laptop, in the project folder (git is already set up there; nothing is committed yet):

```bash
git status
git add .
git commit -m "FinSight AI first public version"
```

Check `git status` first: `server/.env`, `server/data_store.json`, `backups/` and anything from `Real Bank csv/` must **not** be listed. Then create a **private** repository on GitHub and push to it (GitHub shows the two commands).

On the server:

```bash
git clone https://github.com/YOUR-NAME/finsight-ai.git finsight
cd finsight
```

## 5. Fill in the settings

```bash
cp .env.production.example .env
nano .env
```

Make each secret with `openssl rand -hex 32`. Never commit `.env`.

## 6. Start it

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The first build takes several minutes (Python packages for ARM). When the log says the server is running, open `https://YOUR-DOMAIN`. Check `https://YOUR-DOMAIN/api/health` shows `"database": "mysql"` and `"ml_service": "online"`.

Optional demo account for your supervisor and examiners (same data as on your laptop):

```bash
docker compose exec -e DEMO_PASSWORD='choose-a-long-password' app node scripts/seedDemo.js
```

Always pass your own `DEMO_PASSWORD`: the default in `seedDemo.js` is in your code. The "Use the demo account" button only appears in local development, so the live sign-in page does not give the password away. Anyone you give it to can change or delete that account, and sees whatever others upload to it, so share it only with your supervisor and examiners, and remove the account after the viva (Your data and privacy → Delete account).

## 7. Backups

Backups hold every user's financial data, so they are encrypted and a copy is kept off the server. The script refuses to run without encryption.

**On your own laptop (once):** install [age](https://github.com/FiloSottile/age) (Windows: `winget install FiloSottile.age`) and make a key pair:

```bash
age-keygen -o finsight-backup-key.txt
```

It prints a public key starting `age1…`. Keep `finsight-backup-key.txt` private and **off the server** (for example in your password manager and on a USB stick). Without it the backups cannot be opened, by you or anyone else.

**On the server:**

```bash
sudo apt install -y age rclone
nano .env      # add BACKUP_AGE_RECIPIENT=age1… (the public key) and, after the next step, BACKUP_REMOTE
rclone config  # optional but recommended: add a remote, e.g. "gdrive" for a Google Drive folder
```

Set `BACKUP_REMOTE=gdrive:finsight-backups` (your remote name and folder). Run one backup by hand and check the log line says "copied to":

```bash
bash deploy/backup.sh
crontab -e
```

Add this line (03:15 every day; the server keeps 14 days, the off-site copy 60 days):

```
15 3 * * * cd /home/ubuntu/finsight && bash deploy/backup.sh >> backups/backup.log 2>&1
```

**Restore** (this replaces the current data). Decrypt on your laptop, where the private key is, then send the plain dump to the server only for the restore and delete it afterwards:

```bash
age -d -i finsight-backup-key.txt finsight_DATE.sql.gz.age > finsight_DATE.sql.gz
scp finsight_DATE.sql.gz ubuntu@YOUR-SERVER-IP:finsight/
ssh ubuntu@YOUR-SERVER-IP "cd finsight && gunzip -c finsight_DATE.sql.gz | docker compose exec -T mysql sh -c 'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" finsight_ai' && rm finsight_DATE.sql.gz"
```

Do one practice restore before launch (on a fresh test database or right after the first backup), so you know the key and the steps work.

## 8. Updating the site

```bash
cd finsight
git pull
docker compose up -d --build
```

Tables are created and updated by the app at start-up, so no manual database step is needed.

## What changes in production (already in the code)

| Setting | Development | Production (`NODE_ENV=production`) |
|---|---|---|
| JSON fallback store | used when MySQL is down | off: the app retries MySQL, then stops (`DB_FALLBACK`) |
| Visitor IP for limits | direct | from Caddy (`TRUST_PROXY=1`), so one person's failed sign-ins do not block everyone |
| CORS | any localhost | only `https://DOMAIN` |
| Advisor questions | no limit | 30 per user per 24 hours (`ADVISOR_DAILY_LIMIT`) |
| New accounts | no limit | 5 per IP per hour (`REGISTER_MAX_PER_IP`) |
| Security headers | basic | plus HSTS and a Content-Security-Policy |
| Error replies | include details | plain message only |
| AI settings page | may be unlocked | locked (`ALLOW_AI_SETTINGS=false`) |

## Free plan limits to expect

- One server: if it is restarted, the site is down for about a minute.
- Oracle may reclaim an Always Free instance that looks idle (very low CPU, network and memory use over a week), and a small site like this can look idle. Upgrading the account to Pay As You Go stops that and is still free while you stay within the Always Free limits. Check Oracle's current policy, and keep backups off the server either way.
- The ML service and MySQL share the server's memory; 12 GB is far more than FinSight needs. Check with `docker stats`.
