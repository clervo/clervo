import {
  createN427sSourceAdapters,
  sourceQualifications as previousQualifications,
} from '../n4.27s/source-adapters.mjs';
import {
  createDeveloperRegistryAdapter,
  developerRegistryQualification,
} from './developer-registry.mjs';

export const sourceQualifications = Object.freeze(previousQualifications.map((qualification) => (
  qualification.sourceClass === 'developer_registry' ? developerRegistryQualification : qualification
)));

export function createN427tSourceAdapters(options) {
  const previous = createN427sSourceAdapters(options);
  const repairedDeveloper = createDeveloperRegistryAdapter(options);
  return Object.freeze(previous.map((adapter) => (
    adapter.sourceClass === 'developer_registry' ? repairedDeveloper : adapter
  )));
}
