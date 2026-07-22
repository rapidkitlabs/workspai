import type {
  WorkspaceKnowledgeAttribute,
  WorkspaceKnowledgeGraph,
} from './contracts/workspace-knowledge-graph-contract.js';

function xml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function attributeValue(value: WorkspaceKnowledgeAttribute): string {
  return Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
}

export function renderWorkspaceKnowledgeGraphJsonLd(graph: WorkspaceKnowledgeGraph): string {
  const entityById = new Map(graph.entities.map((entity) => [entity.id, entity]));
  const document = {
    '@context': {
      wsp: 'https://workspai.dev/ns/workspace#',
      id: '@id',
      type: '@type',
      label: 'https://www.w3.org/2000/01/rdf-schema#label',
      from: { '@id': 'wsp:from', '@type': '@id' },
      to: { '@id': 'wsp:to', '@type': '@id' },
      proof: { '@id': 'wsp:proof', '@type': '@id' },
    },
    '@id': `urn:workspai:workspace:${encodeURIComponent(graph.workspace.name)}`,
    '@type': 'wsp:WorkspaceKnowledgeGraph',
    generatedAt: graph.generatedAt,
    sourceHash: graph.source.hash,
    '@graph': [
      ...graph.entities.map((entity) => ({
        '@id': `urn:workspai:entity:${encodeURIComponent(entity.id)}`,
        '@type': `wsp:${entity.kind}`,
        label: entity.label,
        ...(entity.projectId ? { projectId: entity.projectId } : {}),
        identityKey: entity.identity.key,
        attributes: entity.attributes,
        proof: entity.proofIds.map((id) => `urn:workspai:proof:${encodeURIComponent(id)}`),
      })),
      ...graph.relations.map((relation) => ({
        '@id': `urn:workspai:relation:${encodeURIComponent(relation.id)}`,
        '@type': `wsp:${relation.kind}`,
        from: `urn:workspai:entity:${encodeURIComponent(relation.from)}`,
        to: `urn:workspai:entity:${encodeURIComponent(relation.to)}`,
        fromLabel: entityById.get(relation.from)?.label ?? relation.from,
        toLabel: entityById.get(relation.to)?.label ?? relation.to,
        derivation: relation.derivation,
        trust: relation.trust,
        confidence: relation.confidence,
        proof: relation.proofIds.map((id) => `urn:workspai:proof:${encodeURIComponent(id)}`),
      })),
      ...graph.proofs.map((proof) => ({
        '@id': `urn:workspai:proof:${encodeURIComponent(proof.id)}`,
        '@type': 'wsp:Evidence',
        provider: proof.provider,
        artifact: proof.artifact,
        ...(proof.pointer ? { pointer: proof.pointer } : {}),
        derivation: proof.derivation,
        trust: proof.trust,
        confidence: proof.confidence,
        freshness: proof.freshness,
      })),
    ],
  };
  return JSON.stringify(document, null, 2);
}

export function renderWorkspaceKnowledgeGraphGraphMl(graph: WorkspaceKnowledgeGraph): string {
  const nodes = graph.entities
    .map((entity) => {
      const attributes = Object.entries(entity.attributes)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, value]) =>
            `      <data key="attributes">${xml(`${key}=${attributeValue(value)}`)}</data>`
        )
        .join('\n');
      return [
        `    <node id="${xml(entity.id)}">`,
        `      <data key="kind">${xml(entity.kind)}</data>`,
        `      <data key="label">${xml(entity.label)}</data>`,
        ...(entity.projectId
          ? [`      <data key="projectId">${xml(entity.projectId)}</data>`]
          : []),
        ...(attributes ? [attributes] : []),
        '    </node>',
      ].join('\n');
    })
    .join('\n');
  const edges = graph.relations
    .map((relation) =>
      [
        `    <edge id="${xml(relation.id)}" source="${xml(relation.from)}" target="${xml(relation.to)}">`,
        `      <data key="relationKind">${xml(relation.kind)}</data>`,
        `      <data key="trust">${xml(relation.trust)}</data>`,
        `      <data key="confidence">${xml(relation.confidence)}</data>`,
        '    </edge>',
      ].join('\n')
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="kind" for="node" attr.name="kind" attr.type="string"/>',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="projectId" for="node" attr.name="projectId" attr.type="string"/>',
    '  <key id="attributes" for="node" attr.name="attributes" attr.type="string"/>',
    '  <key id="relationKind" for="edge" attr.name="kind" attr.type="string"/>',
    '  <key id="trust" for="edge" attr.name="trust" attr.type="string"/>',
    '  <key id="confidence" for="edge" attr.name="confidence" attr.type="string"/>',
    `  <graph id="${xml(graph.workspace.name)}" edgedefault="directed">`,
    nodes,
    edges,
    '  </graph>',
    '</graphml>',
  ].join('\n');
}

export function renderWorkspaceKnowledgeGraphGexf(graph: WorkspaceKnowledgeGraph): string {
  const nodes = graph.entities
    .map(
      (entity) =>
        `      <node id="${xml(entity.id)}" label="${xml(entity.label)}"><attvalues><attvalue for="0" value="${xml(entity.kind)}"/><attvalue for="1" value="${xml(entity.projectId ?? '')}"/></attvalues></node>`
    )
    .join('\n');
  const edges = graph.relations
    .map(
      (relation, index) =>
        `      <edge id="${index}" source="${xml(relation.from)}" target="${xml(relation.to)}" label="${xml(relation.kind)}" weight="${relation.confidence === 'high' ? 1 : relation.confidence === 'medium' ? 0.66 : 0.33}"/>`
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gexf xmlns="http://gexf.net/1.3" version="1.3">',
    `  <meta lastmodifieddate="${xml(graph.generatedAt.slice(0, 10))}"><creator>Workspai</creator><description>${xml(graph.workspace.name)} evidence-backed workspace graph</description></meta>`,
    '  <graph mode="static" defaultedgetype="directed">',
    '    <attributes class="node"><attribute id="0" title="kind" type="string"/><attribute id="1" title="projectId" type="string"/></attributes>',
    '    <nodes>',
    nodes,
    '    </nodes>',
    '    <edges>',
    edges,
    '    </edges>',
    '  </graph>',
    '</gexf>',
  ].join('\n');
}
