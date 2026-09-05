import { createRegistry, defineCard } from "../lib/cards/define"
import { info as info0 } from "./region-latency/info"
import { dataset as dataset0 } from "./region-latency/dataset"
import { requirements as requirements0, collector as collector0 } from "./region-latency/collector"
import { info as info1 } from "./lighthouse/info"
import { dataset as dataset1 } from "./lighthouse/dataset"
import { requirements as requirements1, collector as collector1 } from "./lighthouse/collector"
import { info as info2 } from "./seo-audit/info"
import { dataset as dataset2 } from "./seo-audit/dataset"
import { requirements as requirements2, collector as collector2 } from "./seo-audit/collector"
import { info as info3 } from "./releases/info"
import { dataset as dataset3 } from "./releases/dataset"
import { requirements as requirements3, collector as collector3 } from "./releases/collector"
import { info as info4 } from "./repo-metrics/info"
import { dataset as dataset4 } from "./repo-metrics/dataset"
import { requirements as requirements4, collector as collector4 } from "./repo-metrics/collector"
import { info as info5 } from "./ai-usage/info"
import { dataset as dataset5 } from "./ai-usage/dataset"
import { requirements as requirements5, collector as collector5 } from "./ai-usage/collector"
import { info as info6 } from "./real-users/info"
import { dataset as dataset6 } from "./real-users/dataset"
import { requirements as requirements6, collector as collector6, cacheVersion as cacheVersion6 } from "./real-users/collector"
import { info as info7 } from "./server-errors/info"
import { dataset as dataset7 } from "./server-errors/dataset"
import { requirements as requirements7, collector as collector7, cacheVersion as cacheVersion7 } from "./server-errors/collector"
import { info as info8 } from "./anomalies/info"
import { dataset as dataset8 } from "./anomalies/dataset"
import { requirements as requirements8, collector as collector8 } from "./anomalies/collector"

/** Server-only registry. Browser code uses registry/components. */
export const serverRegistry = createRegistry([
  defineCard({ info: info0, dataset: dataset0, requirements: requirements0, collector: collector0 }),
  defineCard({ info: info1, dataset: dataset1, requirements: requirements1, collector: collector1 }),
  defineCard({ info: info2, dataset: dataset2, requirements: requirements2, collector: collector2 }),
  defineCard({ info: info3, dataset: dataset3, requirements: requirements3, collector: collector3 }),
  defineCard({ info: info4, dataset: dataset4, requirements: requirements4, collector: collector4 }),
  defineCard({ info: info5, dataset: dataset5, requirements: requirements5, collector: collector5 }),
  defineCard({ info: info6, dataset: dataset6, requirements: requirements6, collector: collector6, cacheVersion: cacheVersion6 }),
  defineCard({ info: info7, dataset: dataset7, requirements: requirements7, collector: collector7, cacheVersion: cacheVersion7 }),
  defineCard({ info: info8, dataset: dataset8, requirements: requirements8, collector: collector8 }),
])
