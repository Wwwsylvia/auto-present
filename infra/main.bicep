targetScope = 'resourceGroup'

@description('Short lowercase workload prefix used in resource names.')
@minLength(2)
@maxLength(12)
param namePrefix string = 'idea2impact'

@description('Azure region. The workload is intentionally pinned to East US 2.')
@allowed([
  'eastus2'
])
param location string = 'eastus2'

@description('Container image repository in the provisioned registry.')
param imageRepository string = 'idea2impact'

@description('Container image tag to deploy.')
param imageTag string = 'latest'

@description('Fully qualified container image. Use the bootstrap image for the first deployment, then the immutable ACR image.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Capacity in thousands of tokens per minute for the model deployment.')
@minValue(1)
param modelCapacity int = 10

@description('Optional GitHub token used by the application. It is stored only as a Container Apps secret.')
@secure()
param githubToken string = ''

@description('Tags applied to resources that support tags.')
param tags object = {}

var workloadTags = union(tags, {
  workload: 'idea2impact'
  managedBy: 'bicep'
})
var suffix = uniqueString(subscription().id, resourceGroup().id, namePrefix)
var shortPrefix = toLower(replace(namePrefix, '-', ''))
var acrName = take('${shortPrefix}${suffix}acr', 50)
var storageAccountName = take('${shortPrefix}${suffix}st', 24)
var logAnalyticsName = take('${namePrefix}-${suffix}-log', 63)
var environmentName = take('${namePrefix}-${suffix}-env', 60)
var fileShareName = 'idea2impact-data'
var environmentStorageName = 'shared-data'
var webIdentityName = take('${namePrefix}-${suffix}-web-id', 128)
var jobIdentityName = take('${namePrefix}-${suffix}-job-id', 128)
var foundryName = take('${namePrefix}-${suffix}-ai', 64)
var foundryProjectName = take('${namePrefix}-project', 64)
var modelDeploymentName = 'gpt-5-4-mini'
var speechName = take('${namePrefix}-${suffix}-speech', 64)
var webAppName = take('${namePrefix}-${suffix}-web', 32)
var renderJobName = take('${namePrefix}-${suffix}-render', 32)
var image = empty(containerImage) ? '${registry.properties.loginServer}/${imageRepository}:${imageTag}' : containerImage
var dataMountPath = '/data'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: workloadTags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: workloadTags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: workloadTags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: fileShareName
  properties: {
    accessTier: 'TransactionOptimized'
    enabledProtocols: 'SMB'
    shareQuota: 100
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: environmentName
  location: location
  tags: workloadTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2025-01-01' = {
  parent: environment
  name: environmentStorageName
  properties: {
    azureFile: {
      accessMode: 'ReadWrite'
      accountKey: storageAccount.listKeys().keys[0].value
      accountName: storageAccount.name
      shareName: fileShare.name
    }
  }
}

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryName
  location: location
  tags: workloadTags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: foundryName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: foundryProjectName
  location: location
  tags: workloadTags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    description: 'Idea2Impact inference project'
    displayName: 'Idea2Impact'
  }
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundry
  name: modelDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-5.4-mini'
      version: '2026-03-17'
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

resource speech 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: speechName
  location: location
  tags: workloadTags
  kind: 'SpeechServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: speechName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource webIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: webIdentityName
  location: location
  tags: workloadTags
}

resource jobIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: jobIdentityName
  location: location
  tags: workloadTags
}

var acrPullRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var openAiUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
)
var speechUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'f2dc8367-1007-4938-bd23-fe263f013447'
)

resource webAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, webIdentity.id, acrPullRoleId)
  properties: {
    principalId: webIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource jobAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, jobIdentity.id, acrPullRoleId)
  properties: {
    principalId: jobIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource webOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: foundry
  name: guid(foundry.id, webIdentity.id, openAiUserRoleId)
  properties: {
    principalId: webIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: openAiUserRoleId
  }
}

resource jobSpeechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: speech
  name: guid(speech.id, jobIdentity.id, speechUserRoleId)
  properties: {
    principalId: jobIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: speechUserRoleId
  }
}

var projectEndpoint = 'https://${foundry.name}.services.ai.azure.com/api/projects/${foundryProject.name}'
var dataEnvironment = [
  {
    name: 'IDEA2IMPACT_DATA_DIR'
    value: dataMountPath
  }
]
var foundryEnvironment = [
  {
    name: 'FOUNDRY_PROJECT_ENDPOINT'
    value: projectEndpoint
  }
  {
    name: 'FOUNDRY_MODEL_DEPLOYMENT'
    value: modelDeployment.name
  }
]
var speechEnvironment = [
  {
    name: 'AZURE_SPEECH_REGION'
    value: location
  }
  {
    name: 'AZURE_SPEECH_VOICE'
    value: 'en-US-AvaMultilingualNeural'
  }
  {
    name: 'AZURE_SPEECH_USE_MANAGED_IDENTITY'
    value: 'true'
  }
]
var webSecrets = empty(githubToken) ? [] : [
  {
    name: 'github-token'
    value: githubToken
  }
]

resource webApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: webAppName
  location: location
  tags: workloadTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${webIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3000
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
        transport: 'Auto'
      }
      registries: [
        {
          identity: webIdentity.id
          server: registry.properties.loginServer
        }
      ]
      secrets: webSecrets
    }
    template: {
      containers: [
        {
          name: 'web'
          image: image
          env: concat(dataEnvironment, foundryEnvironment, [
            {
              name: 'AZURE_CLIENT_ID'
              value: webIdentity.properties.clientId
            }
            {
              name: 'AZURE_SUBSCRIPTION_ID'
              value: subscription().subscriptionId
            }
            {
              name: 'AZURE_RESOURCE_GROUP'
              value: resourceGroup().name
            }
            {
              name: 'AZURE_CONTAINER_APP_JOB_NAME'
              value: renderJobName
            }
            {
              name: 'RENDER_EXECUTION_MODE'
              value: 'container-apps-job'
            }
          ], empty(githubToken) ? [] : [
            {
              name: 'GITHUB_TOKEN'
              secretRef: 'github-token'
            }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: [
            {
              mountPath: dataMountPath
              volumeName: 'shared-data'
            }
          ]
        }
      ]
      scale: {
        maxReplicas: 1
        minReplicas: 1
      }
      volumes: [
        {
          name: 'shared-data'
          storageName: environmentStorage.name
          storageType: 'AzureFile'
        }
      ]
    }
  }
  dependsOn: [
    webAcrPull
    webOpenAiUser
  ]
}

resource renderJob 'Microsoft.App/jobs@2025-01-01' = {
  name: renderJobName
  location: location
  tags: workloadTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${jobIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      replicaRetryLimit: 1
      replicaTimeout: 3600
      registries: [
        {
          identity: jobIdentity.id
          server: registry.properties.loginServer
        }
      ]
      secrets: []
      triggerType: 'Manual'
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      containers: [
        {
          name: 'render'
          image: image
          command: [
            'npm'
            'run'
            'render:worker'
          ]
          env: concat(dataEnvironment, speechEnvironment, [
            {
              name: 'AZURE_CLIENT_ID'
              value: jobIdentity.properties.clientId
            }
          ])
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          volumeMounts: [
            {
              mountPath: dataMountPath
              volumeName: 'shared-data'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'shared-data'
          storageName: environmentStorage.name
          storageType: 'AzureFile'
        }
      ]
    }
  }
  dependsOn: [
    jobAcrPull
    jobSpeechUser
  ]
}

var jobOperatorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b9a307c4-5aa3-4b52-ba60-2b17c136cd7b'
)

resource webJobOperator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: renderJob
  name: guid(renderJob.id, webIdentity.id, jobOperatorRoleId)
  properties: {
    principalId: webIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: jobOperatorRoleId
  }
}

output resourceGroupId string = resourceGroup().id
output registryId string = registry.id
output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output logAnalyticsId string = logAnalytics.id
output containerAppsEnvironmentId string = environment.id
output containerAppsEnvironmentName string = environment.name
output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output fileShareName string = fileShare.name
output foundryAccountId string = foundry.id
output foundryAccountName string = foundry.name
output foundryProjectId string = foundryProject.id
output foundryProjectName string = foundryProject.name
output foundryProjectEndpoint string = projectEndpoint
output modelDeploymentName string = modelDeployment.name
output speechAccountId string = speech.id
output speechAccountName string = speech.name
output webIdentityId string = webIdentity.id
output jobIdentityId string = jobIdentity.id
output webContainerAppId string = webApp.id
output webContainerAppName string = webApp.name
output webHost string = webApp.properties.configuration.ingress.fqdn
output renderJobId string = renderJob.id
output renderJobName string = renderJob.name
