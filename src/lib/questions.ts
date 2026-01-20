export interface Question {
    id: number;
    language: string;
    title: string;
    difficulty: string;
    description: string;
    starterCode: string;
    timeLimit: number;
}

export const questions: Question[] = [
    {
        id: 1,
        language: "javascript",
        title: "Two Sum",
        difficulty: "Easy",
        description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

**Example:**
\`\`\`
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: nums[0] + nums[1] = 2 + 7 = 9
\`\`\``,
        starterCode: `function twoSum(nums, target) {
  // Your code here
  
}`,
        timeLimit: 15
    },
    {
        id: 2,
        language: "javascript",
        title: "Reverse String",
        difficulty: "Easy",
        description: `Write a function that reverses a string. The input string is given as an array of characters.

**Example:**
\`\`\`
Input: ["h","e","l","l","o"]
Output: ["o","l","l","e","h"]
\`\`\``,
        starterCode: `function reverseString(s) {
  // Your code here
  
}`,
        timeLimit: 10
    },
    {
        id: 3,
        language: "javascript",
        title: "Valid Parentheses",
        difficulty: "Medium",
        description: `Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.

**Example:**
\`\`\`
Input: "()[]{}"
Output: true

Input: "([)]"
Output: false
\`\`\``,
        starterCode: `function isValid(s) {
  // Your code here
  
}`,
        timeLimit: 15
    },
    {
        id: 4,
        language: "python",
        title: "FizzBuzz",
        difficulty: "Easy",
        description: `Write a program that prints numbers from 1 to n. For multiples of 3, print "Fizz". For multiples of 5, print "Buzz". For multiples of both, print "FizzBuzz".

**Example:**
\`\`\`
Input: n = 15
Output: ["1","2","Fizz","4","Buzz","Fizz","7","8","Fizz","Buzz","11","Fizz","13","14","FizzBuzz"]
\`\`\``,
        starterCode: `def fizzbuzz(n):
    # Your code here
    pass`,
        timeLimit: 10
    },
    {
        id: 5,
        language: "python",
        title: "Palindrome Check",
        difficulty: "Easy",
        description: `Given a string, determine if it is a palindrome (reads the same forwards and backwards), considering only alphanumeric characters and ignoring cases.

**Example:**
\`\`\`
Input: "A man, a plan, a canal: Panama"
Output: true
\`\`\``,
        starterCode: `def is_palindrome(s):
    # Your code here
    pass`,
        timeLimit: 15
    },
    {
        id: 6,
        language: "python",
        title: "Merge Sorted Arrays",
        difficulty: "Medium",
        description: `Given two sorted arrays nums1 and nums2, merge nums2 into nums1 as one sorted array.

**Example:**
\`\`\`
Input: 
nums1 = [1,2,3,0,0,0], m = 3
nums2 = [2,5,6], n = 3
Output: [1,2,2,3,5,6]
\`\`\``,
        starterCode: `def merge(nums1, m, nums2, n):
    # Your code here
    pass`,
        timeLimit: 20
    },
    {
        id: 7,
        language: "java",
        title: "Fibonacci Sequence",
        difficulty: "Easy",
        description: `Calculate the nth Fibonacci number. The Fibonacci sequence is: 0, 1, 1, 2, 3, 5, 8, 13, ...

**Example:**
\`\`\`
Input: n = 6
Output: 8 (0, 1, 1, 2, 3, 5, 8)
\`\`\``,
        starterCode: `public class Solution {
    public int fibonacci(int n) {
        // Your code here
        return 0;
    }
}`,
        timeLimit: 15
    },
    {
        id: 8,
        language: "java",
        title: "Binary Search",
        difficulty: "Medium",
        description: `Given a sorted array of integers and a target value, return the index if the target is found. If not, return -1.

**Example:**
\`\`\`
Input: nums = [-1,0,3,5,9,12], target = 9
Output: 4
\`\`\``,
        starterCode: `public class Solution {
    public int binarySearch(int[] nums, int target) {
        // Your code here
        return -1;
    }
}`,
        timeLimit: 15
    }
];

export function getQuestionsByLanguage(language: string): Question[] {
    return questions.filter(q => q.language === language);
}

export function getQuestionById(id: number): Question | undefined {
    return questions.find(q => q.id === id);
}
