const authentication = require('./authentication')
const newFlowRun = require('./triggers/new_flow_run')
const triggerFlow = require('./creates/trigger_flow')

const addHeaders = (request, z, bundle) => {
  request.headers = request.headers || {}
  request.headers['User-Agent'] = 'North-Zapier/1.0'
  return request
}

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  beforeRequest: [addHeaders],
  afterResponse: [],
  triggers: {
    [newFlowRun.key]: newFlowRun,
  },
  creates: {
    [triggerFlow.key]: triggerFlow,
  },
  resources: {},
  searches: {},
}
