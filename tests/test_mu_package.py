"""MU review packages use current documents and disclose administrative gaps honestly."""
from pathlib import Path
import unittest

from scripts.build_submission_package import DELIVERABLE_SOURCES, allowed_source, source_file, team_gaps
from scripts.verify_package import DELIVERABLES, verify_team_readiness
from scripts.verify_submission import source_paths


class MUReviewPackage(unittest.TestCase):
    def test_package_contains_every_file_bound_by_the_source_digest(self):
        root = Path(__file__).resolve().parents[1]
        omitted = [path.relative_to(root).as_posix() for path in source_paths(root)
                   if not allowed_source(path.relative_to(root).as_posix())]
        self.assertEqual(omitted, [])
        for name in ('scripts/passport_credentials.py', 'tests/private-passport.json', 'docs/team-passport.pdf'):
            with self.subTest(name=name):
                self.assertFalse(allowed_source(name))

    def test_active_deliverables_exist_and_match_the_archive_allowlist(self):
        root = Path(__file__).resolve().parents[1]
        self.assertIn('docs/proposal/Tideway_MU_AI_Builders_2026_Proposal.pdf', DELIVERABLE_SOURCES)
        self.assertIn('docs/MU_HACKATHON_2026.md', DELIVERABLE_SOURCES)
        self.assertNotIn('slides/pitch.pdf', DELIVERABLE_SOURCES)
        self.assertNotIn('docs/submission-notes.pdf', DELIVERABLE_SOURCES)
        self.assertEqual(DELIVERABLES, {Path(name).name for name in DELIVERABLE_SOURCES})
        for name in DELIVERABLE_SOURCES:
            with self.subTest(name=name):
                self.assertIsNotNone(source_file(root, name))

    def test_registered_roster_size_is_three_or_four(self):
        for count in (0, 1, 2, 3, 4, 5, 6):
            with self.subTest(count=count):
                roster = {'team_name': 'Example', 'leader': 'Owner',
                          'members': [{'name': f'Person {index}', 'role': 'Builder'} for index in range(count)]}
                gaps = team_gaps(roster)
                self.assertEqual('Roster of 3-4 registered members' in gaps, count not in (3, 4))
        unnamed = {'team_name': 'Example', 'members': [{'role': 'Builder'} for _ in range(3)]}
        self.assertIn('Roster of 3-4 registered members', team_gaps(unnamed))

    def test_complete_team_information_has_no_invented_five_member_requirement(self):
        roster = {'team_name': 'Example', 'leader': 'Person 0',
                  'members': [{'name': f'Person {index}', 'role': 'Builder'} for index in range(3)],
                  'registration_confirmed': True, 'submission_route_confirmed': True,
                  'eligibility_confirmed': True, 'reviewer_access_confirmed': True}
        self.assertEqual(verify_team_readiness(roster, {'outstanding': []}), [])

    def test_draft_roster_is_preserved_with_explicit_outstanding_items(self):
        roster = {'team_name': 'Example', 'leader': '', 'members': []}
        original = dict(roster)
        gaps = team_gaps(roster)
        self.assertEqual(verify_team_readiness(roster, {'outstanding': gaps}), gaps)
        self.assertIn('Team leader', gaps)
        self.assertIn('Roster of 3-4 registered members', gaps)
        self.assertIn('Team roles', gaps)
        self.assertEqual(roster, original)

    def test_hidden_readiness_gaps_and_malformed_rosters_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'must be disclosed'):
            verify_team_readiness({'team_name': 'Example', 'members': []}, {'outstanding': []})
        for roster in (None, [], {'members': None}, {'members': ['Person']}):
            with self.subTest(roster=roster), self.assertRaises(RuntimeError):
                verify_team_readiness(roster, {'outstanding': []})
