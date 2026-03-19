#!/usr/bin/env bash
# =============================================================================
# setup_aws.sh
# -----------------------------------------------------------------------------
# Provisions all AWS infrastructure for the MMM Project.
#
# Run order:
#   1. Billing alerts  — SNS topic + CloudWatch alarms at $50 / $100 / $150
#   2. S3 bucket       — mmm-project-inference-data (stores 9 .nc model files)
#   3. Security group  — allows SSH (22) and FastAPI (8000) inbound
#   4. EC2 instance    — t2.micro, Amazon Linux 2023, us-east-1
#
# Prerequisites:
#   - AWS CLI installed: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
#   - Profile configured in ~/.aws/credentials (IAM Identity Center SSO)
#   - Confirm credentials work FIRST:
#       aws sts get-caller-identity --profile $PROFILE
#
# Usage:
#   Set PROFILE below, then:
#       bash setup_aws.sh
#
# DO NOT RUN until Ben confirms sandbox credentials are active.
# =============================================================================

set -euo pipefail   # exit on error, unbound var, or pipe failure

# =============================================================================
# ── CONFIGURATION — fill these in before running ──────────────────────────────
# =============================================================================

# Your IAM Identity Center profile name from ~/.aws/credentials
# Format: 123456789_myisb_IsbUsersPS  (Cal Poly sandbox)
PROFILE="mmm-project"

# Email address to receive billing alert notifications
ALERT_EMAIL="ben.robbie.ren@gmail.com"

# EC2 key pair name — must already exist in us-east-1, or create one first:
#   aws ec2 create-key-pair --key-name mmm-key --query 'KeyMaterial' \
#     --output text --profile $PROFILE --region us-east-1 > ~/.ssh/mmm-key.pem
#   chmod 400 ~/.ssh/mmm-key.pem
KEY_PAIR_NAME="mmm-key"

# =============================================================================
# ── CONSTANTS (do not change) ─────────────────────────────────────────────────
# =============================================================================

REGION="us-east-1"
S3_BUCKET="mmm-project-inference-data"
SECURITY_GROUP_NAME="mmm-sg"
INSTANCE_TYPE="t3.micro"   # t2.micro not permitted in this sandbox; t3.micro is same cost (~$0.0104/hr)

# Color codes for readable output
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "${GREEN}MMM Project — AWS Infrastructure Setup${NC}"
echo "Region:  $REGION"
echo "Profile: $PROFILE"
echo "─────────────────────────────────────────"

# Guard: verify credentials before doing anything
echo -e "\n${YELLOW}Verifying AWS credentials...${NC}"
aws sts get-caller-identity --profile "$PROFILE" --region "$REGION"
echo -e "${GREEN}✓ Credentials valid${NC}"


# =============================================================================
# SECTION 1 — BILLING ALERTS
# -----------------------------------------------------------------------------
# Cost: CloudWatch billing alarms are FREE (10 alarms included in free tier).
#       SNS email notifications are FREE for the first 1,000 emails/month.
#
# Why this matters:
#   The Cal Poly sandbox account wipes at $200. Setting alerts at $50/$100/$150
#   gives three warning shots before hitting the ceiling. Billing alarms MUST
#   live in us-east-1 regardless of where other services run — that's an AWS
#   constraint (billing is a global metric only available in us-east-1).
# =============================================================================

echo -e "\n${YELLOW}[1/4] Creating billing alerts...${NC}"

# Create SNS topic — this is the notification channel CloudWatch will fire into
SNS_ARN=$(aws sns create-topic \
  --name "mmm-billing-alerts" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'TopicArn' \
  --output text)

echo "  SNS topic ARN: $SNS_ARN"

# Subscribe your email to the topic — you'll get a confirmation email; click it
aws sns subscribe \
  --topic-arn "$SNS_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --profile "$PROFILE" \
  --region "$REGION" > /dev/null

echo "  ↳ Confirmation email sent to $ALERT_EMAIL — you must click the link to activate alerts"

# Helper function: creates a single CloudWatch billing alarm
# Args: $1 = threshold in USD, $2 = alarm name suffix
create_billing_alarm() {
  local THRESHOLD=$1
  local NAME="mmm-billing-${THRESHOLD}usd"

  aws cloudwatch put-metric-alarm \
    --alarm-name        "$NAME" \
    --alarm-description "MMM Project billing alert: estimated charges exceed \$$THRESHOLD" \
    --metric-name       "EstimatedCharges" \
    --namespace         "AWS/Billing" \
    --statistic         "Maximum" \
    --dimensions        Name=Currency,Value=USD \
    --period            86400 \
    --evaluation-periods 1 \
    --threshold         "$THRESHOLD" \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --alarm-actions     "$SNS_ARN" \
    --profile           "$PROFILE" \
    --region            "$REGION"

  echo "  ✓ Alarm set: \$$THRESHOLD"
}

# Three alert levels — warning / serious / critical
create_billing_alarm 50
create_billing_alarm 100
create_billing_alarm 150

echo -e "${GREEN}✓ Billing alerts complete (SNS + 3 CloudWatch alarms)${NC}"


# =============================================================================
# SECTION 2 — S3 BUCKET
# -----------------------------------------------------------------------------
# Cost: S3 Standard storage — ~$0.023/GB/month.
#       Our 9 .nc files are ~495 MB total → ~$0.01/month. Effectively free.
#       First 5 GB is free under the free tier.
#
# Why this:
#   The FastAPI backend loads .nc InferenceData files on demand. Storing them
#   in S3 means the EC2 instance stays stateless — no local disk dependency,
#   easy to redeploy or scale. The bucket name is locked in datasets_config.json
#   and api/services/loader.py.
# =============================================================================

echo -e "\n${YELLOW}[2/4] Creating S3 bucket: $S3_BUCKET...${NC}"

# us-east-1 is the default region and does NOT accept a LocationConstraint —
# passing it causes an error. All other regions require it. This handles both.
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket \
    --bucket "$S3_BUCKET" \
    --profile "$PROFILE" \
    --region "$REGION"
else
  aws s3api create-bucket \
    --bucket "$S3_BUCKET" \
    --create-bucket-configuration LocationConstraint="$REGION" \
    --profile "$PROFILE" \
    --region "$REGION"
fi

# Enable versioning — protects against accidentally overwriting a model file
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled \
  --profile "$PROFILE" \
  --region "$REGION"

# Block all public access — these are private model files, not a public dataset
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile "$PROFILE" \
  --region "$REGION"

echo -e "${GREEN}✓ S3 bucket created: s3://$S3_BUCKET (versioning on, public access blocked)${NC}"
echo ""
echo "  Next: upload the 9 .nc model files:"
echo "    aws s3 sync models/ s3://$S3_BUCKET/ --profile $PROFILE"


# =============================================================================
# SECTION 3 — SECURITY GROUP
# -----------------------------------------------------------------------------
# Cost: Security groups are free.
#
# Why these ports:
#   22  — SSH so you can log in and manage the instance
#   8000 — FastAPI/Uvicorn default port (API Gateway will forward here)
#
# WARNING: Opening 0.0.0.0/0 on port 22 is acceptable for a short-lived
# capstone sandbox, but for any real deployment you'd restrict SSH to your IP.
# =============================================================================

echo -e "\n${YELLOW}[3/4] Creating EC2 security group: $SECURITY_GROUP_NAME...${NC}"

SG_ID=$(aws ec2 create-security-group \
  --group-name "$SECURITY_GROUP_NAME" \
  --description "MMM Project: SSH + FastAPI" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'GroupId' \
  --output text)

echo "  Security group ID: $SG_ID"

# SSH — for manual access and deployment
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 22 \
  --cidr 0.0.0.0/0 \
  --profile "$PROFILE" \
  --region "$REGION" > /dev/null

echo "  ✓ Inbound rule: TCP 22 (SSH)"

# FastAPI — API Gateway will proxy requests here
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 8000 \
  --cidr 0.0.0.0/0 \
  --profile "$PROFILE" \
  --region "$REGION" > /dev/null

echo "  ✓ Inbound rule: TCP 8000 (FastAPI)"
echo -e "${GREEN}✓ Security group ready${NC}"


# =============================================================================
# SECTION 4 — EC2 INSTANCE
# -----------------------------------------------------------------------------
# Cost: t2.micro is FREE TIER eligible (750 hrs/month for 12 months).
#       After free tier: ~$0.0116/hr → ~$8.50/month if running 24/7.
#       Stop the instance when not in active use to preserve the 750-hr limit.
#
# AMI: We use SSM Parameter Store to dynamically resolve the latest Amazon
#      Linux 2023 AMI ID. Hardcoding an AMI ID is fragile — AMI IDs are
#      region-specific and AWS retires old ones. SSM gives us the current one.
#
# User data: The startup script installs Python, clones the repo, installs
#   requirements, and starts Uvicorn as a background process. In a production
#   setup you'd use systemd for process management instead.
# =============================================================================

echo -e "\n${YELLOW}[4/4] Launching EC2 instance ($INSTANCE_TYPE, $REGION)...${NC}"

# Dynamically resolve the latest Amazon Linux 2023 AMI for x86_64
AMI_ID=$(aws ssm get-parameter \
  --name "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64" \
  --query "Parameter.Value" \
  --output text \
  --profile "$PROFILE" \
  --region "$REGION")

echo "  Resolved AMI: $AMI_ID (Amazon Linux 2023, latest)"

# User data script — runs as root on first boot
# This installs the app and starts the API server automatically
USER_DATA=$(cat <<'USERDATA'
#!/bin/bash
set -e

# System packages
dnf update -y
dnf install -y python3.11 python3.11-pip git

# Clone the project
cd /home/ec2-user
git clone https://github.com/bennrobinsonn/Bayesian-MMM-Dashboard mmm-project
cd mmm-project

# Python dependencies
python3.11 -m pip install -r requirements.txt

# Start FastAPI with Uvicorn
# Note: In production, replace this with a systemd service for automatic restart
nohup python3.11 -m uvicorn api.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2 \
  > /home/ec2-user/uvicorn.log 2>&1 &

echo "FastAPI started. Log: /home/ec2-user/uvicorn.log"
USERDATA
)

# Launch the instance
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id            "$AMI_ID" \
  --instance-type       "$INSTANCE_TYPE" \
  --key-name            "$KEY_PAIR_NAME" \
  --security-group-ids  "$SG_ID" \
  --user-data           "$USER_DATA" \
  --tag-specifications  'ResourceType=instance,Tags=[{Key=Name,Value=mmm-api-server}]' \
  --profile             "$PROFILE" \
  --region              "$REGION" \
  --query               'Instances[0].InstanceId' \
  --output              text)

echo "  Instance ID: $INSTANCE_ID"
echo "  Waiting for instance to reach 'running' state..."

aws ec2 wait instance-running \
  --instance-ids "$INSTANCE_ID" \
  --profile "$PROFILE" \
  --region "$REGION"

# Fetch the public IP once the instance is running
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" \
  --output text \
  --profile "$PROFILE" \
  --region "$REGION")

echo -e "${GREEN}✓ EC2 instance running${NC}"
echo "  Instance ID: $INSTANCE_ID"
echo "  Public IP:   $PUBLIC_IP"


# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete — next steps:${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "1. Check your email and CONFIRM the SNS subscription ($ALERT_EMAIL)"
echo ""
echo "2. Upload model files to S3:"
echo "     aws s3 sync models/ s3://$S3_BUCKET/ --profile $PROFILE"
echo ""
echo "3. SSH into the EC2 instance (once the user data script finishes ~2 min):"
echo "     ssh -i ~/.ssh/${KEY_PAIR_NAME}.pem ec2-user@$PUBLIC_IP"
echo "     tail -f /home/ec2-user/uvicorn.log"
echo ""
echo "4. Test the API from your machine:"
echo "     curl http://$PUBLIC_IP:8000/health"
echo ""
echo "5. Configure API Gateway:"
echo "     - HTTP API type (cheapest — \$3.50/million requests)"
echo "     - Integration: HTTP_PROXY to http://$PUBLIC_IP:8000"
echo "     - No auth for now (lock down before final demo)"
echo ""
echo -e "${YELLOW}REMINDER: Stop the EC2 instance when not in use to preserve your 750-hr limit:${NC}"
echo "     aws ec2 stop-instances --instance-ids $INSTANCE_ID --profile $PROFILE --region $REGION"
echo ""
