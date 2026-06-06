import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

/**
 * BookFilm Engine — GPU host (AWS CDK).
 *
 * Provisions a GPU instance from the Deep Learning Base GPU AMI (NVIDIA driver +
 * Docker + nvidia-container-toolkit) and bootstraps the engine-services compose
 * stack. Equivalent to ../terraform — including **Spot** (one-time) and a
 * **self-terminate timer** as cost guards.
 *
 * Uses a LaunchTemplate (the only clean way to do Spot for a single instance in
 * CloudFormation) launched as one CfnInstance.
 *
 * Context (cdk deploy -c key=value, or cdk.json):
 *   engineApiKey   (required) bearer token; same value goes in server/.env.server
 *   hfToken        Hugging Face token for gated FLUX.1-dev / XTTS
 *   instanceType   default g5.xlarge (use g6e.xlarge / p4d for video)
 *   useSpot        "true" (default) = Spot one-time ~70% cheaper; "false" = on-demand
 *   spotMaxPrice   max $/hr (e.g. "0.5"); empty = cap at on-demand price
 *   autoShutdownMinutes  self-terminate this many min after build (default 60; 0 = never)
 *   engineCidr     CIDR allowed on ports 8001-8006 (default 0.0.0.0/0 — RESTRICT in prod)
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
    const useSpot = ctx('useSpot', 'true') !== 'false'
    const spotMaxPrice = ctx('spotMaxPrice', '')!
    const autoShutdownMinutes = Number(ctx('autoShutdownMinutes', '60'))
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
    sg.addIngressRule(ec2.Peer.ipv4(engineCidr), ec2.Port.tcpRange(8001, 8006), 'Engine services')
    if (sshCidr) sg.addIngressRule(ec2.Peer.ipv4(sshCidr), ec2.Port.tcp(22), 'SSH')

    const role = new iam.Role(this, 'EngineRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    })

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
    // Cost guard: self-terminate after the build (timer starts post-build).
    if (autoShutdownMinutes > 0) {
      userData.addCommands(
        `shutdown -h +${autoShutdownMinutes} "BookFilm Engine auto-terminate after ${autoShutdownMinutes}m"`,
      )
    }

    const lt = new ec2.LaunchTemplate(this, 'EngineLt', {
      instanceType: new ec2.InstanceType(instanceType),
      machineImage,
      role,
      securityGroup: sg,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(rootVolumeGb, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
        },
      ],
      spotOptions: useSpot
        ? {
            requestType: ec2.SpotRequestType.ONE_TIME,
            interruptionBehavior: ec2.SpotInstanceInterruption.TERMINATE,
            maxPrice: spotMaxPrice ? Number(spotMaxPrice) : undefined,
          }
        : undefined,
    })

    // shutdown -h => terminate (so the cost-guard actually destroys the box + EBS).
    const cfnLt = lt.node.defaultChild as ec2.CfnLaunchTemplate
    cfnLt.addPropertyOverride('LaunchTemplateData.InstanceInitiatedShutdownBehavior', 'terminate')

    const instance = new ec2.CfnInstance(this, 'Engine', {
      launchTemplate: {
        launchTemplateId: lt.launchTemplateId,
        version: lt.latestVersionNumber,
      },
      subnetId: vpc.publicSubnets[0].subnetId,
      tags: [{ key: 'Name', value: 'bookfilm-engine' }],
    })

    const dns = instance.attrPublicDnsName
    new cdk.CfnOutput(this, 'PublicDns', { value: dns })
    new cdk.CfnOutput(this, 'EngineImageUrl', { value: `http://${dns}:8001` })
    new cdk.CfnOutput(this, 'EngineVoiceUrl', { value: `http://${dns}:8002` })
    new cdk.CfnOutput(this, 'EngineVideoUrl', { value: `http://${dns}:8003` })
    new cdk.CfnOutput(this, 'EngineMusicUrl', { value: `http://${dns}:8004` })
    new cdk.CfnOutput(this, 'EngineScoreUrl', { value: `http://${dns}:8006/score` })
  }
}
