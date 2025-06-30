/**
 * Demonstration of AI-powered BureaucracyAgent capabilities
 */

import { BureaucracyAgent } from '../src/agents/bureaucracy.js';
import { AgentMessage } from '../src/types/agents.js';
import chalk from 'chalk';

async function demonstrateBureaucracyAgent() {
  console.log(chalk.blue.bold('\n=== AI-Powered Bureaucracy Agent Demo ===\n'));

  // Initialize the agent
  const agent = new BureaucracyAgent({
    name: 'Academic Assistant',
    temperature: 0.7
  });

  try {
    await agent.start();
    console.log(chalk.green('✓ Agent started successfully\n'));

    // 1. Track homework assignment
    console.log(chalk.yellow('1. Tracking Homework Assignment:'));
    const homeworkMsg: AgentMessage = {
      id: 'demo-1',
      from: 'student',
      to: agent.id,
      type: 'command',
      content: {
        action: 'track-homework',
        data: {
          subject: 'Computer Science',
          title: 'Machine Learning Project',
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
          requirements: [
            'Implement neural network from scratch',
            'Write 10-page report',
            'Create presentation slides'
          ]
        }
      },
      timestamp: new Date()
    };

    const homeworkResult = await agent.processMessage(homeworkMsg);
    console.log(chalk.white('Homework tracked:'), homeworkResult.homeworkId);
    console.log(chalk.white('Reminders:'));
    homeworkResult.reminders.forEach((reminder: string) => 
      console.log(chalk.gray(`  - ${reminder}`))
    );

    // 2. Generate extension request email
    console.log(chalk.yellow('\n2. Generating Extension Request Email:'));
    const emailMsg: AgentMessage = {
      id: 'demo-2',
      from: 'student',
      to: agent.id,
      type: 'query',
      content: {
        topic: 'email-draft',
        data: {
          type: 'extension-request',
          recipient: 'professor.smith@university.edu',
          context: {
            assignment: 'Machine Learning Project',
            currentDeadline: 'Next Friday',
            requestedDeadline: 'Following Monday',
            reason: 'Unexpected family emergency requiring travel',
            completionStatus: '60%'
          }
        }
      },
      timestamp: new Date()
    };

    const emailResult = await agent.processMessage(emailMsg);
    console.log(chalk.white('Email Subject:'), emailResult.email.subject);
    console.log(chalk.white('Tips:'));
    emailResult.tips?.forEach((tip: string) => 
      console.log(chalk.gray(`  - ${tip}`))
    );

    // 3. Create negotiation strategy
    console.log(chalk.yellow('\n3. Creating Grade Negotiation Strategy:'));
    const negotiationMsg: AgentMessage = {
      id: 'demo-3',
      from: 'student',
      to: agent.id,
      type: 'query',
      content: {
        topic: 'negotiation-strategy',
        data: {
          teacher: 'Dr. Johnson',
          subject: 'Data Structures',
          goal: 'grade_dispute',
          context: {
            currentGrade: 'B+',
            expectedGrade: 'A-',
            reason: 'Grading error on midterm question 5'
          }
        }
      },
      timestamp: new Date()
    };

    const negotiationResult = await agent.processMessage(negotiationMsg);
    console.log(chalk.white('Strategy confidence:'), 
      chalk.green(`${(negotiationResult.confidence * 100).toFixed(0)}%`));
    console.log(chalk.white('Key tactics:'));
    negotiationResult.tactics?.slice(0, 3).forEach((tactic: string) => 
      console.log(chalk.gray(`  - ${tactic}`))
    );

    // 4. Interpret late submission policy
    console.log(chalk.yellow('\n4. Interpreting Late Submission Policy:'));
    const policyMsg: AgentMessage = {
      id: 'demo-4',
      from: 'student',
      to: agent.id,
      type: 'query',
      content: {
        topic: 'policy-interpretation',
        data: {
          policyId: 'late-submission',
          situation: 'Internet outage prevented submission by midnight deadline',
          objective: 'Minimize grade penalty'
        }
      },
      timestamp: new Date()
    };

    const policyResult = await agent.processMessage(policyMsg);
    console.log(chalk.white('Compliance:'), 
      policyResult.analysis.compliance ? chalk.green('✓') : chalk.red('✗'));
    console.log(chalk.white('Recommendations:'));
    policyResult.analysis.recommendations?.slice(0, 3).forEach((rec: string) => 
      console.log(chalk.gray(`  - ${rec}`))
    );

    // 5. Get agent status
    console.log(chalk.yellow('\n5. Agent Status:'));
    const status = agent.getStatus();
    console.log(chalk.white('AI Enabled:'), chalk.green('✓'));
    console.log(chalk.white('Specialized Capabilities:'));
    status.capabilities.specialized.forEach((cap: string) => 
      console.log(chalk.gray(`  - ${cap}`))
    );
    console.log(chalk.white('\nBureaucracy Stats:'));
    console.log(chalk.gray(`  - Homework assignments: ${status.bureaucracyStats.homeworkAssignments}`));
    console.log(chalk.gray(`  - Email templates: ${status.bureaucracyStats.emailTemplates}`));
    console.log(chalk.gray(`  - Policies: ${status.bureaucracyStats.policies}`));

  } catch (error) {
    console.error(chalk.red('Error:'), error);
  } finally {
    await agent.stop();
    console.log(chalk.green('\n✓ Agent stopped successfully'));
  }
}

// Run the demonstration
demonstrateBureaucracyAgent().catch(console.error);