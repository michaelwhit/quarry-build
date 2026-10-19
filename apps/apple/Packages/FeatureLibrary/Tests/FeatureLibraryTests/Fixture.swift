import Foundation
import StarterLibrary
import Testing

@testable import FeatureLibrary

/// A small unsigned bundle payload with made-up items. It goes through the same decoder as the real
/// bundle (`StarterBundle.decode`), so a wire-format change breaks these tests too.
enum Fixture {
    static let academic = "01900000-0000-7000-8000-000000000001"
    static let reading = "01900000-0000-7000-8000-000000000002"
    static let phonics = "01900000-0000-7000-8000-000000000003"
    static let motorDomain = "01900000-0000-7000-8000-000000000004"
    static let fineMotor = "01900000-0000-7000-8000-000000000005"
    static let cvc = "01900000-0000-7000-8000-000000000010"
    static let fluency = "01900000-0000-7000-8000-000000000011"
    static let pencil = "01900000-0000-7000-8000-000000000012"
    static let other = "01900000-0000-7000-8000-000000000013"
    static let readAloud = "01900000-0000-7000-8000-000000000020"
    static let timer = "01900000-0000-7000-8000-000000000021"

    static let json = """
        {"schema_version":1,"bundle_version":3,"created_at":"2026-10-18T00:00:00Z",
         "taxonomy":[
          {"id":"\(academic)","level":"domain","name":"Academic","synonyms":[],"sort":1},
          {"id":"\(reading)","parent_id":"\(academic)","level":"area","name":"Reading","goal_area":"reading","synonyms":[],"sort":1},
          {"id":"\(phonics)","parent_id":"\(reading)","level":"skill","name":"Phonics and decoding","goal_area":"reading","synonyms":["sounding out"],"sort":1},
          {"id":"\(motorDomain)","level":"domain","name":"Functional","synonyms":[],"sort":2},
          {"id":"\(fineMotor)","parent_id":"\(motorDomain)","level":"skill","name":"Fine motor","goal_area":"motor","synonyms":[],"sort":1}],
         "goals":[
          {"id":"\(cvc)","version":1,"skill_ids":["\(phonics)"],"grade_bands":["K-2"],"title":"Decode CVC words",
           "template_text":"Given a list of {word_type} words, {student} will read each aloud with {80}% accuracy in {3} of {3} consecutive sessions by {date}.",
           "condition_text":"Given a list of {word_type} words","behavior_text":"read each word aloud",
           "slots":[{"name":"word_type","kind":"choice","choices":["CVC","CVCe"],"default":"CVC"}],
           "measurement_plan_template":{"method":"trials","unit":"words","trials_per_session":10},
           "mastery":{"threshold":80,"unit":"percent","comparator":">=","window_kind":"consecutive","window_count":3,"window_of":3,"maintenance_check":true},
           "objective_ladder":[],"standard_refs":[],"deficit_tags":["phonological_processing_low"],
           "related_accommodation_ids":["\(readAloud)"],"discipline":"sped_teacher",
           "provenance":{"origin":"original","author":"test fixture"}},
          {"id":"\(fluency)","version":1,"skill_ids":["\(phonics)"],"grade_bands":["3-5","6-8"],"title":"Read grade-level passages smoothly",
           "template_text":"Given a passage, {student} will read {target} words correct per minute by {date}.",
           "condition_text":"Given a passage","behavior_text":"read aloud smoothly",
           "slots":[{"name":"target","kind":"number"}],
           "measurement_plan_template":{"method":"cbm_probe","unit":"words correct per minute"},
           "mastery":{"threshold_from_slot":"target","unit":"words correct per minute","comparator":">=","window_kind":"best_of","window_count":3,"window_of":4,"maintenance_check":false},
           "objective_ladder":[],"standard_refs":[],"deficit_tags":[],
           "related_accommodation_ids":[],"discipline":"sped_teacher",
           "provenance":{"origin":"original","author":"test fixture","reviewer":"A. Reviewer","reviewed_on":"2026-10-20"}},
          {"id":"\(pencil)","version":1,"skill_ids":["\(fineMotor)"],"grade_bands":["K-2"],"title":"Hold a pencil with a mature grasp",
           "template_text":"With a pencil, {student} will write {number} letters by {date}.",
           "condition_text":"With a pencil","behavior_text":"write letters",
           "slots":[{"name":"number","kind":"number"}],
           "measurement_plan_template":{"method":"trials"},
           "mastery":{"threshold":4,"comparator":">=","window_kind":"consecutive","window_count":2,"window_of":2,"maintenance_check":false},
           "objective_ladder":[],"standard_refs":[],"deficit_tags":["fine_motor_delay"],
           "related_accommodation_ids":[],"discipline":"ot",
           "provenance":{"origin":"original","author":"test fixture"}},
          {"id":"\(other)","version":1,"skill_ids":["\(fineMotor)"],"grade_bands":["9-12"],"title":"Use a keyboard for longer writing",
           "template_text":"Using a keyboard, {student} will type {number} words by {date}.",
           "condition_text":"Using a keyboard","behavior_text":"type words",
           "slots":[{"name":"number","kind":"number"}],
           "measurement_plan_template":{"method":"frequency"},
           "mastery":{"threshold":50,"comparator":">=","window_kind":"consecutive","window_count":3,"window_of":3,"maintenance_check":false},
           "objective_ladder":[],"standard_refs":[],"deficit_tags":[],
           "related_accommodation_ids":[],"discipline":"any",
           "provenance":{"origin":"original","author":"test fixture"}}],
         "accommodations":[
          {"id":"\(readAloud)","version":1,"kind":"accommodation","category":"Presentation","title":"Directions read aloud",
           "description":"Staff read written directions aloud to the student.","need_tags":["decoding_low"],"skill_ids":["\(phonics)"],
           "default_lfd":{"location":"all general education classes","frequency":"for every written assignment","duration_per_occurrence":"2 minutes per occurrence"},
           "provenance":{"origin":"original","author":"test fixture"}},
          {"id":"\(timer)","version":1,"kind":"accommodation","category":"Timing","title":"Extra time on tests",
           "description":"The student gets extra time to finish tests.","need_tags":[],"skill_ids":[],
           "default_lfd":{},"provenance":{"origin":"original","author":"test fixture"}}],
         "phrases":[]}
        """

    static func index() throws -> LibraryIndex {
        LibraryIndex(try StarterBundle.decodeUnverified(payload: Data(json.utf8)))
    }

    /// The index with one goal's fields replaced, for tests that need an unusual template. It goes
    /// through the same decoder as everything else.
    static func goal(_ id: String, changing edits: [String: Any]) throws -> GoalTemplate {
        var root = try #require(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        var goals = try #require(root["goals"] as? [[String: Any]])
        let at = try #require(goals.firstIndex { $0["id"] as? String == id })
        for (key, value) in edits { goals[at][key] = value }
        root["goals"] = goals
        let data = try JSONSerialization.data(withJSONObject: root)
        return try #require(LibraryIndex(try StarterBundle.decodeUnverified(payload: data)).goal(id: id))
    }
}
