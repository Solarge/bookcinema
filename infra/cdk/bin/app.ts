#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { GpuStack } from '../lib/gpu-stack'

const app = new cdk.App()

// account/region come from your AWS CLI profile (CDK_DEFAULT_*). A concrete
// env is required because the stack does a VPC lookup.
new GpuStack(app, 'BookfilmEngineGpu', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
