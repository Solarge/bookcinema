import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

/**
 * BookFilm Engine — GPU host (AWS CDK).
 *
 * Provisions a GPU EC2 instance from the Deep Learning Base GPU AMI (NVIDIA
 * driver + Docker + nvidia-container-toolkit preinstalled) and bootstraps the
 * engine-services compose stack. Equivalent to ../terraform.
 *
 * Context (cdk deploy -c key=value, or cdk.json):
 *   engineApiKey   (required) bearer token; same value goes in server/.env.server
 *   hfToken        Hugging Face token for gated FLUX.1-dev / XTTS
 *   instanceType   default g5.xlarge (use g6e.xlarge / p4d for video)
 *   engineCidr     CIDR allowed on ports 8001-8004 (default 0.0.0.0/0 — RESTRICT in prod)
 *   sshCidr        CIDR allowed on 22 (default none; use SSM Session Manager)
 *   repoUrl        git URL containing engine-services/ (default the public repo)
 *   repoBranch     default main
 *   rootVolumeGb   default 300
 */
export class GpuStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const ctx = (k: string, d?: string) => (this.node.tryGetContext(k) as string) ?? d
    const engineApiKey = ctx('engineApiKey')
    if (!engineApiKey) throw new Error('Missing -c engineApiKey=<token>')
    const hfToken = ctx('hfToken', '')!
    const instanceType = ctx('instanceType', 'g5.xlarge')!
    const engineCidr = ctx('engineCidr', '0.0.0.0/0')!
    const sshCidr = ctx('sshCidr', '')!
    const repoUrl = ctx('repoUrl', 'https://github.com/Solarge/bookcinema.git')!
    const repoBranch = ctx('repoBranch', 'main')!
    const rootVolumeGb = Number(ctx('rootVolumeGb', '300'))

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true })

    const sg = new ec2.SecurityGroup(this, 'EngineSg', {
      vpc,
      description: 'BookFilm Engine GPU services',
      allowAllOutbound: true,
    })
    sg.addIngressRule(ec2.Peer.ipv4(engineCidr), ec2.Port.tcpRange(8001, 8004), 'Engine services')
    if (sshCidr) sg.addIngressRule(ec2.Peer.ipv4(sshCidr), ec2.Port.tcp(22), 'SSH')

    const role = new iam.Role(this, 'EngineRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    })

    // Latest AWS Deep Learning Base GPU AMI (Ubuntu 22.04).
    const machineImage = ec2.MachineImage.lookup({
      name: 'Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)*',
      owners: ['amazon'],
    })

    const userData = ec2.UserData.forLinux()
    userData.addCommands(
      'set -euxo pipefail',
      'mkdir -p /opt/bookfilm && cd /opt/bookfilm',
      `if [ ! -d repo ]; then git clone --branch ${repoBranch} ${repoUrl} repo; else cd repo && git pull && cd /opt/bookfilm; fi`,
      'cd repo/engine-services',
      `printf 'ENGINE_API_KEY=%s\\nHF_TOKEN=%s\\n' '${engineApiKey}' '${hfToken}' > .env`,
      'chmod 600 .env',
      'docker compose -f docker-compose.gpu.yml up -d --build',
    )

    const instance = new ec2.Instance(this, 'Engine', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(instanceType),
      machineImage,
      securityGroup: sg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(rootVolumeGb, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
        },
      ],
    })

    const dns = instance.instancePublicDnsName
    new cdk.CfnOutput(this, 'PublicDns', { value: dns })
    new cdk.CfnOutput(this, 'EngineImageUrl', { value: `http://${dns}:8001` })
    new cdk.CfnOutput(this, 'EngineVoiceUrl', { value: `http://${dns}:8002` })
    new cdk.CfnOutput(this, 'EngineVideoUrl', { value: `http://${dns}:8003` })
    new cdk.CfnOutput(this, 'EngineMusicUrl', { value: `http://${dns}:8004` })
  }
}
