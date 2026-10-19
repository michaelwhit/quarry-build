// Deny by default: Cedar denies anything no permit covers. The forbids below always win.

// ---- Guards ------------------------------------------------------------------------------

@id("forbid-inactive")
forbid (principal, action, resource) when { !principal.active };

@id("forbid-cross-tenant")
forbid (principal, action, resource) when { principal.tenant != resource.tenant };

// IT admins configure the tenant but never see student data. Vendor support has no standing
// access at all (support grants are a later, time-limited mechanism, security 3.5).
@id("forbid-it-and-vendor-student-data")
forbid (principal, action, resource is Student)
  when { principal.role == "district_it_admin" || principal.role == "vendor_support" };

// ---- SPED Director: district-wide ---------------------------------------------------------

@id("director-read")
permit (principal, action == Action::"ReadSection", resource is Student)
  when { principal.role == "sped_director" && context.relationship == "district" };

@id("director-write-s4-s5")
permit (principal, action == Action::"WriteSection", resource is Student)
  when { principal.role == "sped_director" && context.relationship == "district" && context.tier >= 4 };

@id("director-export")
permit (principal, action == Action::"Export", resource is Student)
  when { principal.role == "sped_director" && context.relationship == "district" };

@id("director-admin")
permit (principal, action in [Action::"ManageCaseload", Action::"ViewAuditReport"], resource is Tenant)
  when { principal.role == "sped_director" };

// A director cannot change their own role (security 3.3).
@id("director-change-role")
permit (principal, action == Action::"ChangeRole", resource is Staff)
  when { principal.role == "sped_director" && !context.self };

// ---- Building SPED Coordinator ------------------------------------------------------------

@id("coordinator-read")
permit (principal, action == Action::"ReadSection", resource is Student)
  when { principal.role == "building_coordinator" && context.relationship == "building" };

@id("coordinator-write-s4")
permit (principal, action == Action::"WriteSection", resource is Student)
  when { principal.role == "building_coordinator" && context.relationship == "building" && context.tier == 4 };

@id("coordinator-manage-caseload")
permit (principal, action == Action::"ManageCaseload", resource is Tenant)
  when { principal.role == "building_coordinator" };

// ---- Case Manager: own caseload -----------------------------------------------------------

@id("case-manager-read")
permit (principal, action == Action::"ReadSection", resource is Student)
  when { principal.role == "case_manager" && context.relationship == "caseload" };

@id("case-manager-write-s2-s4")
permit (principal, action == Action::"WriteSection", resource is Student)
  when { principal.role == "case_manager" && context.relationship == "caseload"
         && context.tier >= 2 && context.tier <= 4 };

@id("case-manager-write-own-s5-notes")
permit (principal, action == Action::"WriteSection", resource is Student)
  when { principal.role == "case_manager" && context.relationship == "caseload"
         && context.tier == 5 && context.authored };

@id("case-manager-data-delegate-export")
permit (principal, action in [Action::"AddDataPoint", Action::"DelegateGoal", Action::"Export"],
        resource is Student)
  when { principal.role == "case_manager" && context.relationship == "caseload" };

// ---- Related-service provider: students they serve ----------------------------------------

@id("provider-read")
permit (principal, action == Action::"ReadSection", resource is Student)
  when { principal.role == "related_service_provider" && context.relationship == "service"
         && (context.tier <= 4 || context.ownService) };

@id("provider-write-own-s3")
permit (principal, action in [Action::"WriteSection", Action::"AddDataPoint"], resource is Student)
  when { principal.role == "related_service_provider" && context.relationship == "service"
         && context.tier == 3 && context.ownService };

// ---- General-ed teacher and paraprofessional ----------------------------------------------
// Read S1 and S2 on their roster or delegations. S3 only for goals delegated to them, and the
// only write is adding a data point to such a goal.

@id("gen-ed-and-para-read")
permit (principal, action == Action::"ReadSection", resource is Student)
  when { (principal.role == "gen_ed_teacher" && context.relationship == "class_roster"
          || principal.role == "paraprofessional" && context.relationship == "delegated")
         && (context.tier <= 2 || (context.tier == 3 && context.delegated)) };

@id("gen-ed-and-para-add-data")
permit (principal, action == Action::"AddDataPoint", resource is Student)
  when { (principal.role == "gen_ed_teacher" && context.relationship == "class_roster"
          || principal.role == "paraprofessional" && context.relationship == "delegated")
         && context.delegated };

// ---- AI features: a separate permission (security 3.3) ------------------------------------
// Needs the tenant setting for the role and read access to the S4 sections the draft uses.

@id("ai-use")
permit (principal, action == Action::"UseAi", resource is Student)
  when { principal.aiEnabled
         && (principal.role == "case_manager" && context.relationship == "caseload"
             || principal.role == "related_service_provider" && context.relationship == "service"
             || principal.role == "sped_director" && context.relationship == "district"
             || principal.role == "building_coordinator" && context.relationship == "building") };

// ---- IT admin: tenant configuration only --------------------------------------------------

@id("it-admin-configure")
permit (principal, action == Action::"ConfigureTenant", resource is Tenant)
  when { principal.role == "district_it_admin" };
