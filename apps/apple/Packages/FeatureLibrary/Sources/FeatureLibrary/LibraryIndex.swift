import Foundation
import StarterLibrary

/// Filter chips for the goal browser. Within one group the chips are OR; across groups they are AND
/// (product decision). Empty group means no filter on that group.
public struct GoalFilters: Equatable, Sendable {
    public var areas: Set<String> = []
    public var gradeBands: Set<String> = []
    public var disciplines: Set<String> = []
    /// A taxonomy node picked in the tree; matches goals under it at any depth.
    public var taxonomyNodeId: String?

    public init(
        areas: Set<String> = [], gradeBands: Set<String> = [], disciplines: Set<String> = [],
        taxonomyNodeId: String? = nil
    ) {
        self.areas = areas
        self.gradeBands = gradeBands
        self.disciplines = disciplines
        self.taxonomyNodeId = taxonomyNodeId
    }

    public var isEmpty: Bool {
        areas.isEmpty && gradeBands.isEmpty && disciplines.isEmpty && taxonomyNodeId == nil
    }
}

/// One row of the taxonomy tree with the number of goals underneath it.
public struct TaxonomyRow: Identifiable, Sendable, Equatable {
    public var id: String { node.id }
    public let node: TaxonomyNode
    public let depth: Int
    public let goalCount: Int
}

/// Search, filter and tree over one decoded bundle. Built once per bundle; all lookups are in memory
/// so the browser stays instant offline. Holds no student data.
public struct LibraryIndex: Sendable {
    public let content: StarterLibraryContent
    private let nodesById: [String: TaxonomyNode]
    private let childrenByParent: [String?: [TaxonomyNode]]
    private let goalSearchText: [String: String]
    private let goalAreaById: [String: String]
    private let goalCountByNode: [String: Int]
    private let accommodationSearchText: [String: String]

    public init(_ content: StarterLibraryContent) {
        self.content = content
        let byId = Dictionary(content.taxonomy.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        nodesById = byId
        childrenByParent = Dictionary(grouping: content.taxonomy, by: { $0.parentId }).mapValues {
            $0.sorted { ($0.sort, $0.name) < ($1.sort, $1.name) }
        }

        func ancestry(of id: String) -> [TaxonomyNode] {
            var chain: [TaxonomyNode] = []
            var seen: Set<String> = []
            var next: String? = id
            while let current = next, !seen.contains(current), let node = byId[current] {
                seen.insert(current)
                chain.append(node)
                next = node.parentId
            }
            return chain
        }

        var text: [String: String] = [:]
        var areas: [String: String] = [:]
        for goal in content.goals {
            let chain = goal.skillIds.flatMap(ancestry(of:))
            if let area = chain.compactMap(\.goalArea).first { areas[goal.id] = area }
            var parts = [goal.title, goal.templateText, goal.conditionText, goal.behaviorText]
            parts += goal.deficitTags.map(LibraryLabels.tag)
            parts += goal.standardRefs
            parts += chain.map(\.name)
            parts += chain.flatMap(\.synonyms)
            parts.append(LibraryLabels.discipline(goal.discipline))
            text[goal.id] = Self.normalize(parts.joined(separator: " "))
        }
        goalSearchText = text
        var counts: [String: Int] = [:]
        for goal in content.goals {
            // Each goal counts once per node on the way up from its skills.
            for id in Set(goal.skillIds.flatMap { ancestry(of: $0).map(\.id) }) { counts[id, default: 0] += 1 }
        }
        goalCountByNode = counts
        goalAreaById = areas

        var accText: [String: String] = [:]
        for item in content.accommodations {
            var parts = [item.title, item.description, item.category]
            parts += item.needTags.map(LibraryLabels.tag)
            parts += item.skillIds.compactMap { byId[$0]?.name }
            parts += item.skillIds.flatMap { byId[$0]?.synonyms ?? [] }
            accText[item.id] = Self.normalize(parts.joined(separator: " "))
        }
        accommodationSearchText = accText
    }

    // MARK: Chips

    public var availableAreas: [String] {
        Set(goalAreaById.values).sorted()
    }

    public var availableGradeBands: [String] {
        let order = ["EC", "K-2", "3-5", "6-8", "9-12", "18-21"]
        let present = Set(content.goals.flatMap(\.gradeBands))
        return order.filter(present.contains) + present.subtracting(order).sorted()
    }

    public var availableDisciplines: [String] {
        Set(content.goals.map(\.discipline)).sorted()
    }

    public func area(of goal: GoalTemplate) -> String? { goalAreaById[goal.id] }

    public static func areaLabel(_ raw: String) -> String { LibraryLabels.readable(raw) }

    // MARK: Goals

    /// Matches every typed word (any of its synonyms, as a word start) and every chip group.
    /// Best title matches first, then title order.
    public func goals(matching query: String, filters: GoalFilters = GoalFilters()) -> [GoalTemplate] {
        let wanted = Self.queryTerms(query)
        let scoped: Set<String>? = filters.taxonomyNodeId.map { id in Set(subtreeIds(id)) }
        var scored: [(GoalTemplate, Int)] = []
        for goal in content.goals {
            guard passes(goal, filters, scopedNodes: scoped) else { continue }
            let hay = goalSearchText[goal.id] ?? ""
            guard let score = Self.score(wanted, in: hay, title: Self.normalize(goal.title)) else { continue }
            scored.append((goal, score))
        }
        return scored.sorted {
            $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.title.localizedCaseInsensitiveCompare($1.0.title) == .orderedAscending
        }.map(\.0)
    }

    private func passes(_ goal: GoalTemplate, _ f: GoalFilters, scopedNodes: Set<String>?) -> Bool {
        if !f.areas.isEmpty {
            guard let area = goalAreaById[goal.id], f.areas.contains(area) else { return false }
        }
        if !f.gradeBands.isEmpty, f.gradeBands.isDisjoint(with: goal.gradeBands) { return false }
        if !f.disciplines.isEmpty, !f.disciplines.contains(goal.discipline) { return false }
        if let scopedNodes, scopedNodes.isDisjoint(with: Set(goal.skillIds)) { return false }
        return true
    }

    /// The node and everything under it.
    func subtreeIds(_ id: String) -> [String] {
        var out: [String] = []
        var stack = [id]
        var seen: Set<String> = []
        while let current = stack.popLast() {
            guard seen.insert(current).inserted else { continue }
            out.append(current)
            stack += (childrenByParent[current] ?? []).map(\.id)
        }
        return out
    }

    // MARK: Taxonomy tree

    /// Depth-first rows for a tree list, each with its goal count. Empty branches are kept so the
    /// teacher sees the whole map, with a zero.
    public func taxonomyRows() -> [TaxonomyRow] {
        var rows: [TaxonomyRow] = []
        func walk(_ parent: String?, depth: Int, visited: Set<String>) {
            for node in childrenByParent[parent] ?? [] where !visited.contains(node.id) {
                rows.append(TaxonomyRow(node: node, depth: depth, goalCount: goalCountByNode[node.id] ?? 0))
                walk(node.id, depth: depth + 1, visited: visited.union([node.id]))
            }
        }
        walk(nil, depth: 0, visited: [])
        return rows
    }

    public func node(_ id: String) -> TaxonomyNode? { nodesById[id] }

    /// "Academic › Reading › Phonics and decoding" for a skill id.
    public func path(toNode id: String) -> String {
        var names: [String] = []
        var seen: Set<String> = []
        var next: String? = id
        while let current = next, seen.insert(current).inserted, let node = nodesById[current] {
            names.append(node.name)
            next = node.parentId
        }
        return names.reversed().joined(separator: " › ")
    }

    // MARK: Accommodations

    public var accommodationCategories: [String] {
        Set(content.accommodations.map(\.category)).sorted()
    }

    public func accommodations(matching query: String, categories: Set<String> = []) -> [AccommodationTemplate] {
        let wanted = Self.queryTerms(query)
        var scored: [(AccommodationTemplate, Int)] = []
        for item in content.accommodations {
            if !categories.isEmpty, !categories.contains(item.category) { continue }
            let hay = accommodationSearchText[item.id] ?? ""
            guard let score = Self.score(wanted, in: hay, title: Self.normalize(item.title)) else { continue }
            scored.append((item, score))
        }
        return scored.sorted {
            $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.title.localizedCaseInsensitiveCompare($1.0.title) == .orderedAscending
        }.map(\.0)
    }

    public func goal(id: String) -> GoalTemplate? { content.goals.first { $0.id == id } }
    public func accommodation(id: String) -> AccommodationTemplate? { content.accommodations.first { $0.id == id } }

    // MARK: Search internals

    /// Teacher words that the bundle's own wording does not use. Each group is one meaning: typing
    /// any word in the group also finds the others. Curators can extend taxonomy synonyms
    /// in the bundle; this list covers everyday teacher and therapist shorthand.
    static let synonymGroups: [[String]] = [
        ["phonics", "decoding", "sounding out"],
        ["speech", "articulation", "language"],
        ["ot", "occupational therapy", "fine motor", "handwriting"],
        ["pt", "physical therapy", "gross motor"],
        ["slp", "speech-language", "communication"],
        ["behavior", "behaviour", "self regulation", "regulation"],
        ["math", "mathematics", "number sense"],
        ["writing", "composition", "written expression"],
        ["reading", "literacy"],
        ["fluency", "words correct per minute", "wcpm"],
        ["comprehension", "understanding what is read"],
        ["social", "sel", "social-emotional"],
        ["psych", "school psychologist"],
    ]

    static func normalize(_ s: String) -> String {
        let folded = s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        let cleaned = folded.map { $0.isLetter || $0.isNumber ? $0 : " " }
        return String(cleaned).split(separator: " ").joined(separator: " ")
    }

    /// One entry per typed word: the word plus every synonym that maps to it.
    static func queryTerms(_ query: String) -> [[String]] {
        let words = normalize(query).split(separator: " ").map(String.init)
        let groups = synonymGroups.map { $0.map(normalize) }
        return words.map { word in
            var alternatives: Set<String> = [word]
            for group in groups where group.contains(word) { alternatives.formUnion(group) }
            return Array(alternatives)
        }
    }

    /// Nil when some typed word matches nothing. Higher is better: title hits count most.
    static func score(_ wanted: [[String]], in haystack: String, title: String) -> Int? {
        if wanted.isEmpty { return 0 }
        let padded = " " + haystack
        let paddedTitle = " " + title
        var total = 0
        for alternatives in wanted {
            var best: Int?
            for alt in alternatives {
                if hit(alt, in: paddedTitle) {
                    best = max(best ?? 0, 3)
                } else if hit(alt, in: padded) {
                    best = max(best ?? 0, 1)
                }
            }
            guard let found = best else { return nil }
            total += found
        }
        return total
    }

    /// Word-start match; one- and two-letter words ("OT", "PT") must be the whole word so "ot" does
    /// not find "other".
    private static func hit(_ term: String, in padded: String) -> Bool {
        let needle = " " + term
        if term.count <= 2 { return (padded + " ").contains(needle + " ") }
        return padded.contains(needle)
    }
}
